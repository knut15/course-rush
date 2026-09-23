// 스키마를 적용한다. 마이그레이션 도구를 쓰지 않는다 —
// 이 프로젝트의 스키마는 한 번 정해지고 거의 바뀌지 않으며, 매 측정 전에 통째로 다시 만드는 쪽이 빠르다.

import "./env.js";

import { readFileSync } from "node:fs";
import { pool } from "./db.js";

const sql = readFileSync(new URL("../sql/schema.sql", import.meta.url), "utf8");

await pool().query(sql);
console.log("스키마 적용 완료");
await pool().end();
