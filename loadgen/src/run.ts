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
import { get, makeAgent, post, simple } from "./http.js";
import { randomUUID } from "node:crypto";
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
  /** 사람이 읽을 출력을 끄고 결과 JSON 한 덩이만 stdout 에 낸다. 웹이 이걸 읽는다 */
  json: boolean;
  /** 대기열을 거쳐 신청한다. 줄 서기 → 입장 → 신청 */
  queue: boolean;
  /** 대기열 유입 속도(초당 입장 수). 이 값이 대기 시간과 신청 지연을 반대로 움직인다 */
  rate: number | null;
};

function parseArgs(): Args {
  const arg = (name: string, fallback?: string) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    mode: arg("mode", "M1")!,
    total: Number(arg("total", "10000")),
    concurrency: Number(arg("concurrency", "1000")),
    courseId: Number(arg("course", "1")),
    base: arg("url", "http://localhost:4100")!,
    warmup: Number(arg("warmup", "200")),
    poolSize: arg("pool") ? Number(arg("pool")) : null,
    timeoutMs: Number(arg("timeout", "30000")),
    save: arg("save", "true") !== "false",
    students: Number(arg("students", "10000")),
    capacity: arg("capacity") ? Number(arg("capacity")) : null,
    repeat: Number(arg("repeat", "1")),
    json: arg("json", "false") === "true",
    queue: arg("queue", "false") === "true",
    rate: arg("rate") ? Number(arg("rate")) : null,
  };
}

type Tally = {
  enrolled: number;
  full: number;
  duplicate: number;
  /** M3 가 재시도 상한을 다 쓰고도 자리를 못 잡은 경우. 마감이 아니라 실패다 */
  conflict: number;
  /** 대기열 모드에서 제한 시간 안에 입장하지 못한 수 */
  notAdmitted: number;
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
    notAdmitted: 0,
    errors: 0,
    timeouts: 0,
    retries: 0,
  };
  const samples: number[] = [];
  /** 줄 서서 기다린 시간. 신청 처리 시간과 섞지 않는다 — 둘은 반대로 움직인다 */
  const waitSamples: number[] = [];

  let next = 0;
  const startedAt = performance.now();

  // 워커 풀. 동시성 C 를 넘지 않게 유지하면서 총 count 개를 던진다.
  // Promise.all 로 한꺼번에 만들면 동시성이 C 가 아니라 count 가 되어 통제가 사라진다.
  // 대기열을 거칠 때 — 줄을 서고, 입장할 때까지 폴링하고, 그다음 신청한다.
  //
  // SSE 가 아니라 폴링을 쓴다. 생성기가 1,000개의 SSE 연결을 열면
  // 그 연결 자체가 부하가 되어 재려는 것을 가린다. 실제 대기열도 대개 폴링이다.
  const POLL_MS = 200;

  async function waitForAdmission(token: string): Promise<boolean> {
    const checkUrl = new URL(`/queue/check/${token}`, args.base);
    const deadline = performance.now() + args.timeoutMs;
    for (;;) {
      const r = await get(agent, checkUrl, args.timeoutMs);
      const body = r.body as { admitted?: boolean } | null;
      if (body?.admitted) return true;
      if (performance.now() > deadline) return false;
      await new Promise((res) => setTimeout(res, POLL_MS));
    }
  }

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= count) return;
      // 학생 id 는 1부터. 범위를 좁히면 같은 학생이 다시 신청하게 되어 중복 경로가 열린다.
      //
      // 기본값(10,000)으로는 중복이 거의 안 난다. 등록이 초반에 마감되면 뒤 요청은
      // INSERT 까지 가지 않아 UNIQUE 제약이 발동할 기회가 없기 때문이다.
      const studentId = (i % args.students) + 1;
      const headers: Record<string, string> = {};

      try {
        if (args.queue) {
          const token = randomUUID();
          const waitStart = performance.now();
          await post(agent, new URL("/queue/enter", args.base), { token }, args.timeoutMs);
          const admitted = await waitForAdmission(token);
          const waited = performance.now() - waitStart;
          if (collect) waitSamples.push(waited);
          if (!admitted) {
            tally.notAdmitted++;
            continue;
          }
          headers["x-admission-token"] = token;
        }

        const r = await post(
          agent,
          url,
          { courseId: args.courseId, studentId },
          args.timeoutMs,
          headers,
        );
        // 대기열 모드에서도 이 값은 **신청 처리 시간만** 담는다. 줄 서 있던 시간은 위에서 따로 잰다.
        if (collect) samples.push(r.ms);
        const body = r.body as { outcome?: string; retries?: number } | null;
        const outcome = body?.outcome;
        if (outcome === "enrolled") tally.enrolled++;
        else if (outcome === "full") tally.full++;
        else if (outcome === "duplicate") tally.duplicate++;
        else if (outcome === "conflict") tally.conflict++;
        else if (outcome === "not-admitted") tally.notAdmitted++;
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

  return { tally, samples, waitSamples, elapsedMs };
}

const args = parseArgs();
const reset = () => simple("POST", new URL("/admin/reset", args.base));
const readStats = () =>
  simple("GET", new URL(`/admin/stats?courseId=${args.courseId}`, args.base)) as Promise<Stats>;

// json 모드에서는 stdout 을 오염시키지 않는다. 웹이 파싱해야 하기 때문이다.
const say = (line: string) => {
  if (!args.json) console.log(line);
};

say(
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
if (args.rate !== null) {
  await simple("POST", new URL("/queue/rate", args.base), { rate: args.rate });
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
  waitMs: { p50: number; p95: number; p99: number; max: number } | null;
  redis?: Stats["redis"];
};

const rounds: Round[] = [];

for (let n = 1; n <= args.repeat; n++) {
  await reset();
  const { tally, samples, waitSamples, elapsedMs } = await fire(args, args.total, true);
  const stats = await readStats();
  const p = percentiles(samples);
  const w = waitSamples.length > 0 ? percentiles(waitSamples) : null;

  rounds.push({
    round: n,
    over: stats.over,
    enrolledRows: stats.enrolledRows,
    duplicateStudents: stats.duplicateStudents,
    outcome: tally,
    elapsedMs: round(elapsedMs),
    rps: round((args.total / elapsedMs) * 1000),
    latencyMs: { p50: round(p.p50), p95: round(p.p95), p99: round(p.p99), max: round(p.max) },
    waitMs: w
      ? { p50: round(w.p50), p95: round(w.p95), p99: round(w.p99), max: round(w.max) }
      : null,
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
  queue: args.queue ? { enabled: true, rate: args.rate } : { enabled: false, rate: null },
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
    notAdmitted: median(pick((r) => r.outcome.notAdmitted)),
    // 줄 서서 기다린 시간. 신청 지연과 **반대 방향으로** 움직이는 것이 이 데모의 요점이다.
    waitP50: median(pick((r) => r.waitMs?.p50 ?? 0)),
    waitP99: median(pick((r) => r.waitMs?.p99 ?? 0)),
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
say("");
if (args.repeat > 1) {
  say(`  회차별 초과       ${pick((r) => r.over).join(", ")}`);
  say(`  회차별 p99        ${pick((r) => r.latencyMs.p99).join(", ")}`);
  say("");
}
say(`  정원              ${capacity}`);
say(`  등록 (중앙값)     ${m.enrolledRows}`);
say(
  `  초과 (중앙값)     ${m.over}${m.over > 0 ? "  ← 정원이 깨졌다" : ""}` +
    (args.repeat > 1 ? `   범위 ${summary.range.over[0]}~${summary.range.over[1]}` : ""),
);
say(`  중복 학생         ${m.duplicateStudents}`);
if (m.conflict > 0) say(`  충돌 소진         ${m.conflict}   ← 마감이 아니라 실패다`);
if (m.retries > 0) say(`  재시도 누적       ${m.retries}`);
say(`  에러+타임아웃     ${m.errors}`);
say("");
say(
  `  RPS (중앙값)      ${m.rps}` +
    (args.repeat > 1 ? `   범위 ${summary.range.rps[0]}~${summary.range.rps[1]}` : ""),
);
say(`  p50 / p95 / p99   ${m.p50} / ${m.p95} / ${m.p99} ms   (신청 처리만)`);
if (args.queue) {
  say("");
  say(`  대기열 유입 속도  ${args.rate ?? "현재값"}/초`);
  say(`  줄 선 시간 p50    ${m.waitP50} ms`);
  say(`  줄 선 시간 p99    ${m.waitP99} ms`);
  if (m.notAdmitted > 0) say(`  입장 실패         ${m.notAdmitted}   ← 제한 시간 안에 못 들어갔다`);
}
if (args.repeat > 1) say(`  p99 범위          ${summary.range.p99[0]}~${summary.range.p99[1]} ms`);

if (args.json) {
  // 마지막에 한 번만 낸다. 앞의 say() 들은 전부 눌려 있으므로 stdout 은 이 JSON 하나뿐이다.
  process.stdout.write(JSON.stringify(summary));
}

if (args.save) {
  mkdirSync("../results", { recursive: true });
  const q = args.queue ? `-q${args.rate ?? "cur"}` : "";
  const file = `../results/${args.mode}-cap${capacity}-c${args.concurrency}${q}-x${args.repeat}-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(summary, null, 2));
  say(`\n  저장 ${file}`);
}
