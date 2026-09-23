// 대기열. Redis Sorted Set 하나와 입장 토큰 키로 만든다.
//
// **대기열이 지키는 것은 신청 서버가 아니라 DB 다**(GOAL.md §5).
// 하는 일은 "초당 몇 명까지 DB 에 닿게 할지" 를 정하는 것뿐이고,
// 그 숫자(rate)를 바꾸면 대기 시간과 신청 지연이 반대 방향으로 움직인다.
// 그 교환을 눈으로 보이게 하는 것이 이 코드의 목적이다.

import { redis } from "./redis.js";

const WAITING = "queue:waiting"; // ZSET  score=진입 시각(ms), member=토큰
const RATE = "queue:rate"; // 초당 입장 허용 수
const admittedKey = (token: string) => `queue:admitted:${token}`;

// 입장 토큰의 수명. 짧으면 화장실 다녀온 사이에 자리를 잃고,
// 길면 들어와 놓고 신청하지 않는 사람이 자리를 오래 물고 있는다.
const ADMISSION_TTL_SEC = 300;

const DEFAULT_RATE = 200;

// 워커를 100ms 마다 돌린다. 1초에 한 번 rate 명을 한꺼번에 꺼내면
// 그 순간에만 요청이 몰려 톱니 모양 부하가 된다. 잘게 쪼개 고르게 흘린다.
const TICK_MS = 100;

let carry = 0; // rate 가 10으로 나누어떨어지지 않을 때의 소수점을 이월한다
let timer: NodeJS.Timeout | null = null;

export async function getRate(): Promise<number> {
  const v = await redis.get(RATE);
  return v === null ? DEFAULT_RATE : Number(v);
}

export async function setRate(rate: number): Promise<void> {
  await redis.set(RATE, String(rate));
}

/** 대기열에 선다. 이미 서 있으면 그 자리를 그대로 돌려준다. */
export async function enter(token: string): Promise<{ token: string; rank: number }> {
  // NX — 이미 있으면 score 를 덮어쓰지 않는다. 새로고침으로 순번이 밀리면 안 된다.
  await redis.zadd(WAITING, "NX", Date.now(), token);
  const rank = await redis.zrank(WAITING, token);
  return { token, rank: rank === null ? 0 : rank };
}

export async function check(token: string): Promise<{
  admitted: boolean;
  rank: number | null;
  ahead: number;
  waiting: number;
  rate: number;
  etaSec: number | null;
}> {
  const [admitted, rank, waiting, rate] = await Promise.all([
    redis.exists(admittedKey(token)),
    redis.zrank(WAITING, token),
    redis.zcard(WAITING),
    getRate(),
  ]);

  const ahead = rank === null ? 0 : rank;
  return {
    admitted: admitted === 1,
    rank,
    ahead,
    waiting,
    rate,
    // 앞사람 수를 유입 속도로 나눈 값. 속도가 그대로일 때의 추정이고, 속도를 바꾸면 이 값도 바뀐다.
    etaSec: rank === null || rate <= 0 ? null : Math.ceil(ahead / rate),
  };
}

export async function isAdmitted(token: string): Promise<boolean> {
  return (await redis.exists(admittedKey(token))) === 1;
}

export async function reset(): Promise<void> {
  const keys = await redis.keys("queue:admitted:*");
  const multi = redis.multi().del(WAITING);
  if (keys.length > 0) multi.del(...keys);
  await multi.exec();
  carry = 0;
}

export async function stats(): Promise<{ waiting: number; rate: number; admitted: number }> {
  const [waiting, rate, keys] = await Promise.all([
    redis.zcard(WAITING),
    getRate(),
    redis.keys("queue:admitted:*"),
  ]);
  return { waiting, rate, admitted: keys.length };
}

/** 앞에서부터 정해진 속도로 꺼내 입장시킨다. */
async function admitTick(): Promise<void> {
  const rate = await getRate();
  if (rate <= 0) return;

  carry += (rate * TICK_MS) / 1000;
  const take = Math.floor(carry);
  if (take < 1) return;
  carry -= take;

  // ZPOPMIN 은 점수가 가장 낮은 것부터 꺼낸다 — 먼저 온 순서다.
  const popped = await redis.zpopmin(WAITING, take);
  if (popped.length === 0) return;

  // [member, score, member, score, ...] 로 온다.
  const multi = redis.multi();
  for (let i = 0; i < popped.length; i += 2) {
    const token = popped[i];
    if (token) multi.set(admittedKey(token), "1", "EX", ADMISSION_TTL_SEC);
  }
  await multi.exec();
}

export function startAdmissionWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    void admitTick().catch((e) => console.error("[queue] 입장 처리 실패", e));
  }, TICK_MS);
  // 워커 때문에 프로세스가 안 죽는 일이 없게 한다.
  timer.unref();
}
