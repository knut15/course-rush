// 시드. 학생 10,000명과 과목 1개(정원 50).
//
// 요청마다 다른 학생 id 를 써야 중복신청 방지 규칙이 실제로 검사된다.
// 학생 수가 총 요청 수보다 적으면 id 가 돌면서 중복이 섞이고,
// 그러면 정원 초과와 중복 거절이 한 수치에 뒤엉킨다(GOAL.md §7).

import "./env.js";

import { pool } from "./db.js";

const STUDENTS = Number(process.env.SEED_STUDENTS ?? 10_000);
const CAPACITY = Number(process.env.SEED_CAPACITY ?? 50);

await pool().query("TRUNCATE enrollments, students, courses RESTART IDENTITY CASCADE");

// 10,000 번의 INSERT 대신 generate_series 한 문장. 왕복이 1회로 끝난다.
await pool().query("INSERT INTO students (name) SELECT '학생 ' || g FROM generate_series(1, $1) g", [
  STUDENTS,
]);

await pool().query("INSERT INTO courses (code, title, capacity) VALUES ($1, $2, $3)", [
  "CS101",
  "자료구조",
  CAPACITY,
]);

console.log(`시드 완료 — 학생 ${STUDENTS.toLocaleString()}명, 과목 1개(정원 ${CAPACITY})`);
await pool().end();
