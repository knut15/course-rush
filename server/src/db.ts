// 커넥션 풀. 크기를 런타임에 바꿀 수 있어야 한다(GOAL.md §6).
//
// M2(비관적 락)의 p99 가 락 대기 때문인지 풀 고갈 때문인지 구분하려면 풀 크기가 실험 변수여야 한다.
// ORM 대신 pg 를 직접 쓰는 이유의 절반이 이것이다 — 나머지 절반은 다섯 전략이 전부 raw SQL 이라는 것이다.

import pg from "pg";
import { DATABASE_URL, DEFAULT_POOL_SIZE } from "./env.js";

// pg 는 bigint(int8)와 count(*) 를 문자열로 준다. 자릿수가 넘칠 수 있어서 기본이 그렇다.
// 이 프로젝트의 수는 전부 안전 범위 안이므로 숫자로 받는다. 안 하면 집계마다 Number() 를 부르게 된다.
pg.types.setTypeParser(20, (v) => Number(v));

let current: { size: number; pool: pg.Pool } = {
  size: DEFAULT_POOL_SIZE,
  pool: createPool(DEFAULT_POOL_SIZE),
};

function createPool(size: number): pg.Pool {
  return new pg.Pool({
    connectionString: DATABASE_URL,
    max: size,
    // 풀이 꽉 찼을 때 무한정 기다리지 않는다. 이 타임아웃이 곧 "풀 고갈" 의 관측 지점이다.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export const pool = () => current.pool;
export const poolSize = () => current.size;

export async function setPoolSize(size: number): Promise<void> {
  if (size === current.size) return;
  const old = current.pool;
  current = { size, pool: createPool(size) };
  // 새 풀을 먼저 세우고 옛 풀을 닫는다. 순서를 바꾸면 그 사이의 요청이 갈 곳을 잃는다.
  await old.end();
}

// 23505 = unique_violation. 중복신청이 이 코드로 온다.
export const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
