// M5 전용 Redis 연결과 Lua 스크립트.
//
// 스크립트를 defineCommand 로 등록해 두면 ioredis 가 EVALSHA 로 부르고,
// 스크립트 본문은 처음 한 번만 올라간다. 매 요청에 수백 바이트를 다시 보내지 않는다.

// ioredis 는 CJS 패키지다. moduleResolution: NodeNext 에서 default import 를 하면
// 타입이 네임스페이스로 잡혀 new 가 되지 않는다. named export 를 쓴다.
import { Redis } from "ioredis";
import { REDIS_URL } from "./env.js";

export const redis = new Redis(REDIS_URL, {
  // 부하 중에 재시도가 끼면 측정값이 흔들린다. 실패는 실패로 드러나는 쪽이 낫다.
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: false,
});

export const remainingKey = (courseId: number) => `course:${courseId}:remaining`;
export const studentsKey = (courseId: number) => `course:${courseId}:students`;

// ── 좌석 선점 스크립트 ──────────────────────────────────────────────
//
// **중복 검사와 정원 차감을 한 스크립트에 넣는 것이 핵심이다.**
// 두 명령으로 나누면 SISMEMBER 와 DECR 사이가 다시 열리고, 그러면 Redis 로 옮긴 의미가 없다.
// Redis 는 스크립트 하나를 통째로 원자적으로 실행한다.
//
// 반환값
//   >= 0  성공. 남은 좌석 수
//     -1  마감
//     -2  이미 신청한 학생
const CLAIM_LUA = `
local already = redis.call('SISMEMBER', KEYS[2], ARGV[1])
if already == 1 then return -2 end

local remaining = redis.call('DECR', KEYS[1])
if remaining < 0 then
  -- 음수까지 내려간 것을 되돌린다. 안 되돌리면 다음 요청들이 계속 더 깊은 음수를 보고
  -- 나중에 좌석을 늘려도 그만큼 채워지지 않는다.
  redis.call('INCR', KEYS[1])
  return -1
end

redis.call('SADD', KEYS[2], ARGV[1])
return remaining
`;

// DB 반영에 실패했을 때 되돌리는 스크립트. 선점만 하고 기록이 없으면 좌석이 증발한다.
const RELEASE_LUA = `
if redis.call('SREM', KEYS[2], ARGV[1]) == 1 then
  return redis.call('INCR', KEYS[1])
end
return -1
`;

redis.defineCommand("claimSeat", { numberOfKeys: 2, lua: CLAIM_LUA });
redis.defineCommand("releaseSeat", { numberOfKeys: 2, lua: RELEASE_LUA });

type WithScripts = Redis & {
  claimSeat(remaining: string, students: string, studentId: string): Promise<number>;
  releaseSeat(remaining: string, students: string, studentId: string): Promise<number>;
};

export const r = redis as WithScripts;

/** 측정 시작 전에 좌석 상태를 DB 의 정원과 맞춘다. 안 하면 앞 실행이 다음 실행에 샌다. */
export async function resetCourseSeats(courseId: number, capacity: number): Promise<void> {
  await redis
    .multi()
    .set(remainingKey(courseId), String(capacity))
    .del(studentsKey(courseId))
    .exec();
}
