// 가장 먼저 로드되어야 하는 모듈이다. 다른 모듈이 process.env 를 읽기 전에 값이 있어야 한다.

import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

if (!process.env.DATABASE_URL) {
  // 30분 돌다가 undefined 를 만나는 것보다 부팅에 실패하는 쪽이 낫다.
  throw new Error("DATABASE_URL 이 없습니다. server/.env 를 확인하세요.");
}

export const DATABASE_URL = process.env.DATABASE_URL;
// Redis 는 M5 만 쓴다. 없으면 M5 만 실패하고 M1~M4 는 그대로 돈다 —
// 그래서 DATABASE_URL 과 달리 부팅을 막지 않는다.
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
export const PORT = Number(process.env.PORT ?? 4100);
export const DEFAULT_POOL_SIZE = Number(process.env.POOL_SIZE ?? 20);
