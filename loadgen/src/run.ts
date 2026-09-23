// 부하 생성기. 신청 서버와 **다른 프로세스**로 돈다(GOAL.md §6).
//
// 절차를 고정한다 — 초기화 → 워밍업(버림) → [초기화 → 측정] × N → 중앙값.
// 이 순서를 어기면 수치가 조용히 틀린다. 워밍업을 안 버리면 첫 요청들의
// 커넥션 수립·JIT 비용이 p99 에 섞이고, 초기화를 빼먹으면 앞 회차의 등록이 남아
// 다음 회차가 곧바로 "마감" 이 된다.
//
// 반복이 필요한 이유는 따로 있다. M1 의 초과 건수는 실행마다 크게 흔들린다(80~392).
// 한 번의 값을 슬라이드에 실으면 그건 측정이 아니라 우연이다.

import { mkdirSync, writeFileSync } from "node:fs";
import { makeAgent, post, simple } from "./http.js";
import { percentiles, round, median } from "./stats.js";

type Args = {
  mode: string;
  total: number;
  concurrency: number;
  courseId: number;
  base: string;
  warmup: number;
  poolSize: number | null;
  timeoutMs: number;
  save: boolean;
  students: number;
  capacity: number | null;
  repeat: number;
};

function parseArgs(): Args {
  const get = (name: string, fallback?: string) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    mode: get("mode", "M1")!,
    total: Number(get("total", "10000")),
    concurrency: Number(get("concurrency", "1000")),
    courseId: Number(get("course", "1")),
    base: get("url", "http://localhost:4100")!,
    warmup: Number(get("warmup", "200")),
    poolSize: get("pool") ? Number(get("pool")) : null,
    timeoutMs: Number(get("timeout", "30000")),
    save: get("save", "true") !== "false",
    students: Number(get("students", "10000")),
    capacity: get("capacity") ? Number(get("capacity")) : null,
    repeat: Number(get("repeat", "1")),
  };
}

type Tally = {
  enrolled: number;
  full: number;
  duplicate: number;
  /** M3 가 재시도 상한을 다 쓰고도 자리를 못 잡은 경우. 마감이 아니라 실패다 */
  conflict: number;
  errors: number;
  timeouts: number;
  retries: number;
};

type Stats = {
  capacity: number;
  enrolledRows: number;
  over: number;
  duplicateStudents: number;
  enrolledCountColumn: number;
  redis?: { remaining: number | null; claimed: number; leaked: number | null };
};

async function fire(args: Args, count: number, collect: boolean) {
  const url = new URL(`/enroll?mode=${args.mode}`, args.base);
  const agent = makeAgent(args.concurrency);
  const tally: Tally = {
    enrolled: 0,
    full: 0,
    duplicate: 0,
    conflict: 0,
    errors: 0,
    timeouts: 0,
    retries: 0,
  };
  const samples: number[] = [];

  let next = 0;
  const startedAt = performance.now();

  // 워커 풀. 동시성 C 를 넘지 않게 유지하면서 총 count 개를 던진다.
  // Promise.all 로 한꺼번에 만들면 동시성이 C 가 아니라 count 가 되어 통제가 사라진다.
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= count) return;
      // 학생 id 는 1부터. 범위를 좁히면 같은 학생이 다시 신청하게 되어 중복 경로가 열린다.
      //
      // 기본값(10,000)으로는 중복이 거의 안 난다. 등록이 초반에 마감되면 뒤 요청은
      // INSERT 까지 가지 않아 UNIQUE 제약이 발동할 기회가 없기 때문이다.
      const studentId = (i % args.students) + 1;
      try {
        const r = await post(agent, url, { courseId: args.courseId, studentId }, args.timeoutMs);
        if (collect) samples.push(r.ms);
        const body = r.body as { outcome?: string; retries?: number } | null;
        const outcome = body?.outcome;
        if (outcome === "enrolled") tally.enrolled++;
        else if (outcome === "full") tally.full++;
        else if (outcome === "duplicate") tally.duplicate++;
        else if (outcome === "conflict") tally.conflict++;
        else tally.errors++;
        tally.retries += body?.retries ?? 0;
      } catch (e) {
        if (collect) samples.push(args.timeoutMs);
        if (e instanceof Error && e.message === "timeout") tally.timeouts++;
        else tally.errors++;
      }
    }
  };

  await Promise.all(Array.from({ length: args.concurrency }, worker));
  const elapsedMs = performance.now() - startedAt;
  agent.destroy();

  return { tally, samples, elapsedMs };
}

const args = parseArgs();
const reset = () => simple("POST", new URL("/admin/reset", args.base));
const readStats = () =>
  simple("GET", new URL(`/admin/stats?courseId=${args.courseId}`, args.base)) as Promise<Stats>;

console.log(
  `▶ mode=${args.mode} total=${args.total.toLocaleString()} concurrency=${args.concurrency}` +
    ` students=${args.students.toLocaleString()} pool=${args.poolSize ?? "기본"} repeat=${args.repeat}`,
);

if (args.poolSize !== null) {
  await simple("POST", new URL("/admin/pool", args.base), { size: args.poolSize });
}
if (args.capacity !== null) {
  await simple("POST", new URL("/admin/capacity", args.base), {
    courseId: args.courseId,
    capacity: args.capacity,
  });
}

// 워밍업 — 결과를 버린다. 회차마다 다시 하지 않는다. 한 번이면 예열은 끝난다.
await reset();
if (args.warmup > 0) await fire(args, args.warmup, false);

type Round = {
  round: number;
  over: number;
  enrolledRows: number;
  duplicateStudents: number;
  outcome: Tally;
  elapsedMs: number;
  rps: number;
  latencyMs: { p50: number; p95: number; p99: number; max: number };
  redis?: Stats["redis"];
};

const rounds: Round[] = [];

for (let n = 1; n <= args.repeat; n++) {
  await reset();
  const { tally, samples, elapsedMs } = await fire(args, args.total, true);
  const stats = await readStats();
  const p = percentiles(samples);

  rounds.push({
    round: n,
    over: stats.over,
    enrolledRows: stats.enrolledRows,
    duplicateStudents: stats.duplicateStudents,
    outcome: tally,
    elapsedMs: round(elapsedMs),
    rps: round((args.total / elapsedMs) * 1000),
    latencyMs: { p50: round(p.p50), p95: round(p.p95), p99: round(p.p99), max: round(p.max) },
    redis: stats.redis,
  });
}

const capacity = (await readStats()).capacity;
const pick = <T>(f: (r: Round) => number) => rounds.map(f);

const summary = {
  measuredAt: new Date().toISOString(),
  env: "10코어 / 16GB / macOS · 전부 로컬",
  generator: "internal",
  mode: args.mode,
  total: args.total,
  concurrency: args.concurrency,
  students: args.students,
  poolSize: args.poolSize,
  capacity,
  repeat: args.repeat,
  // **중앙값을 쓴다.** 평균은 한 번의 이상치에 끌려간다.
  median: {
    over: median(pick((r) => r.over)),
    enrolledRows: median(pick((r) => r.enrolledRows)),
    duplicateStudents: median(pick((r) => r.duplicateStudents)),
    conflict: median(pick((r) => r.outcome.conflict)),
    retries: median(pick((r) => r.outcome.retries)),
    errors: median(pick((r) => r.outcome.errors + r.outcome.timeouts)),
    rps: median(pick((r) => r.rps)),
    p50: median(pick((r) => r.latencyMs.p50)),
    p95: median(pick((r) => r.latencyMs.p95)),
    p99: median(pick((r) => r.latencyMs.p99)),
  },
  // 범위도 함께 남긴다. 중앙값만 보면 얼마나 흔들리는지가 사라진다.
  range: {
    over: [Math.min(...pick((r) => r.over)), Math.max(...pick((r) => r.over))],
    p99: [
      Math.min(...pick((r) => r.latencyMs.p99)),
      Math.max(...pick((r) => r.latencyMs.p99)),
    ],
    rps: [Math.min(...pick((r) => r.rps)), Math.max(...pick((r) => r.rps))],
  },
  rounds,
};

const m = summary.median;
console.log("");
if (args.repeat > 1) {
  console.log(`  회차별 초과       ${pick((r) => r.over).join(", ")}`);
  console.log(`  회차별 p99        ${pick((r) => r.latencyMs.p99).join(", ")}`);
  console.log("");
}
console.log(`  정원              ${capacity}`);
console.log(`  등록 (중앙값)     ${m.enrolledRows}`);
console.log(
  `  초과 (중앙값)     ${m.over}${m.over > 0 ? "  ← 정원이 깨졌다" : ""}` +
    (args.repeat > 1 ? `   범위 ${summary.range.over[0]}~${summary.range.over[1]}` : ""),
);
console.log(`  중복 학생         ${m.duplicateStudents}`);
if (m.conflict > 0) console.log(`  충돌 소진         ${m.conflict}   ← 마감이 아니라 실패다`);
if (m.retries > 0) console.log(`  재시도 누적       ${m.retries}`);
console.log(`  에러+타임아웃     ${m.errors}`);
console.log("");
console.log(
  `  RPS (중앙값)      ${m.rps}` +
    (args.repeat > 1 ? `   범위 ${summary.range.rps[0]}~${summary.range.rps[1]}` : ""),
);
console.log(`  p50 / p95 / p99   ${m.p50} / ${m.p95} / ${m.p99} ms`);
if (args.repeat > 1) console.log(`  p99 범위          ${summary.range.p99[0]}~${summary.range.p99[1]} ms`);

if (args.save) {
  mkdirSync("../results", { recursive: true });
  const file = `../results/${args.mode}-cap${capacity}-c${args.concurrency}-x${args.repeat}-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(summary, null, 2));
  console.log(`\n  저장 ${file}`);
}
