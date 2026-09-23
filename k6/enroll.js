// k6 부하 스크립트. Docker 로 돌린다 — 로컬에 바이너리를 설치하지 않는다(GOAL.md §1).
//
// 내부 생성기(loadgen)와 같은 조건을 던지고 수치를 대조하는 것이 목적이다.
// 둘이 다르면 다르다고 적고 왜 다른지 쓴다(GOAL.md §11-5).
//
// 실행: k6/run.sh M4 --capacity=5000

import http from "k6/http";
import { Counter } from "k6/metrics";
import exec from "k6/execution";

const BASE = __ENV.BASE_URL || "http://host.docker.internal:4100";
const MODE = __ENV.MODE || "M1";
const TOTAL = Number(__ENV.TOTAL || 10000);
const VUS = Number(__ENV.VUS || 1000);
const STUDENTS = Number(__ENV.STUDENTS || 10000);
const CAPACITY = __ENV.CAPACITY ? Number(__ENV.CAPACITY) : 0;

export const options = {
  scenarios: {
    rush: {
      // shared-iterations — VU 들이 정해진 총 횟수를 나눠 갖는다.
      // 내부 생성기의 워커 풀과 같은 모양이다: 동시성 VUS 를 유지하며 총 TOTAL 개를 던진다.
      executor: "shared-iterations",
      vus: VUS,
      iterations: TOTAL,
      maxDuration: "10m",
    },
  },
  // 임계값을 두지 않는다. 통과/실패를 가리는 것이 아니라 수치를 재는 것이 목적이다.
  thresholds: {},
  summaryTrendStats: ["p(50)", "p(95)", "p(99)", "max"],
  // 409 는 마감·중복이라 정상이다. k6 가 실패로 세지 않게 한다.
  discardResponseBodies: false,
};

const enrolled = new Counter("outcome_enrolled");
const full = new Counter("outcome_full");
const duplicate = new Counter("outcome_duplicate");
const conflict = new Counter("outcome_conflict");
const unexpected = new Counter("outcome_unexpected");

const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

export function setup() {
  if (CAPACITY > 0) {
    http.post(
      `${BASE}/admin/capacity`,
      JSON.stringify({ courseId: 1, capacity: CAPACITY }),
      JSON_HEADERS,
    );
  }
  // 워밍업 200건. 내부 생성기와 같은 절차를 밟는다 — 안 그러면 대조가 성립하지 않는다.
  for (let i = 0; i < 200; i++) {
    http.post(
      `${BASE}/enroll?mode=${MODE}`,
      JSON.stringify({ courseId: 1, studentId: (i % STUDENTS) + 1 }),
      JSON_HEADERS,
    );
  }
  http.post(`${BASE}/admin/reset`);
  return {};
}

export default function () {
  // iterationInTest 는 테스트 전체에서 0..TOTAL-1 로 유일하다.
  // __VU 와 __ITER 를 조합하면 VU 수가 바뀔 때 학생 id 분포가 달라져 조건이 흔들린다.
  const i = exec.scenario.iterationInTest;
  const studentId = (i % STUDENTS) + 1;

  const res = http.post(
    `${BASE}/enroll?mode=${MODE}`,
    JSON.stringify({ courseId: 1, studentId }),
    JSON_HEADERS,
  );

  let outcome = null;
  try {
    outcome = res.json("outcome");
  } catch (e) {
    outcome = null;
  }

  if (outcome === "enrolled") enrolled.add(1);
  else if (outcome === "full") full.add(1);
  else if (outcome === "duplicate") duplicate.add(1);
  else if (outcome === "conflict") conflict.add(1);
  else unexpected.add(1);
}

export function handleSummary(data) {
  const m = data.metrics;
  const count = (name) => (m[name] ? m[name].values.count : 0);
  const trend = (name, stat) => (m[name] ? Math.round(m[name].values[stat] * 10) / 10 : 0);

  const out = {
    generator: "k6",
    env: "10코어 / 16GB / macOS · k6 는 Docker 컨테이너에서 실행",
    mode: MODE,
    total: TOTAL,
    concurrency: VUS,
    students: STUDENTS,
    requestedCapacity: CAPACITY || null,
    outcome: {
      enrolled: count("outcome_enrolled"),
      full: count("outcome_full"),
      duplicate: count("outcome_duplicate"),
      conflict: count("outcome_conflict"),
      unexpected: count("outcome_unexpected"),
    },
    rps: m.http_reqs ? Math.round(m.http_reqs.values.rate * 10) / 10 : 0,
    latencyMs: {
      p50: trend("http_req_duration", "p(50)"),
      p95: trend("http_req_duration", "p(95)"),
      p99: trend("http_req_duration", "p(99)"),
      max: trend("http_req_duration", "max"),
    },
  };

  const o = out.outcome;
  const lines = [
    "",
    `  성공(201)         ${o.enrolled}`,
    `  마감(409)         ${o.full}   ← 에러가 아니다`,
    `  중복(409)         ${o.duplicate}`,
    o.conflict > 0 ? `  충돌 소진         ${o.conflict}   ← 마감이 아니라 실패다` : null,
    `  예상 밖 응답      ${o.unexpected}`,
    "",
    `  RPS               ${out.rps}`,
    `  p50 / p95 / p99   ${out.latencyMs.p50} / ${out.latencyMs.p95} / ${out.latencyMs.p99} ms`,
    `  max               ${out.latencyMs.max}ms`,
    "",
  ].filter(Boolean);

  // 셸이 이 줄만 꺼내 JSON 으로 저장한다.
  return { stdout: lines.join("\n") + "\nK6_JSON " + JSON.stringify(out) + "\n" };
}
