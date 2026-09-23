// M2 — 비관적 락. **정확하지만 줄을 서는 것을 보여주는 코드다.**
//
// `SELECT ... FOR UPDATE` 로 courses 의 그 행을 잠근다. 잠근 트랜잭션이 COMMIT 할 때까지
// 같은 행을 잠그려는 다른 트랜잭션은 기다린다. 그래서 읽기·판정·쓰기가 한 줄로 직렬화되고
// 정원이 깨지지 않는다.
//
// 대가가 둘이다.
//  1. 모든 신청이 한 줄로 선다. 동시성이 올라가도 처리량이 늘지 않는다.
//  2. 기다리는 동안 **DB 커넥션을 붙잡고 있다.** 풀이 20개면 21번째 요청은
//     락이 아니라 풀을 기다린다. p99 가 커질 때 둘 중 무엇 때문인지 가르려면
//     풀 크기를 바꿔 가며 재야 한다(GOAL.md §6).

import type pg from "pg";
import { isUniqueViolation } from "../db.js";
import type { Strategy } from "./types.js";

export const m2Pessimistic: Strategy = {
  id: "M2",
  name: "비관적 락",
  summary: "SELECT ... FOR UPDATE 로 행을 잠그고 판정한다. 정확하지만 전부 줄을 선다.",

  async enroll(pool, { courseId, studentId }) {
    // 트랜잭션은 한 커넥션 안에서만 성립한다. pool.query() 는 매번 다른 커넥션을 줄 수 있어
    // BEGIN 과 COMMIT 이 다른 커넥션으로 흩어진다. 그래서 전용 커넥션을 잡는다.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const course = await client.query<{ capacity: number }>(
        "SELECT capacity FROM courses WHERE id = $1 FOR UPDATE",
        [courseId],
      );
      const capacity = course.rows[0]?.capacity;
      if (capacity === undefined) {
        await client.query("ROLLBACK");
        throw new Error(`과목 ${courseId} 가 없습니다.`);
      }

      const counted = await client.query<{ n: number }>(
        "SELECT count(*)::bigint AS n FROM enrollments WHERE course_id = $1",
        [courseId],
      );
      if ((counted.rows[0]?.n ?? 0) >= capacity) {
        await client.query("ROLLBACK");
        return { outcome: "full" };
      }

      await client.query("INSERT INTO enrollments (course_id, student_id) VALUES ($1, $2)", [
        courseId,
        studentId,
      ]);
      await client.query("COMMIT");
      return { outcome: "enrolled" };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      if (isUniqueViolation(e)) return { outcome: "duplicate" };
      throw e;
    } finally {
      // 반납을 빠뜨리면 풀이 조용히 말라붙는다. finally 가 아니면 예외 경로에서 샌다.
      client.release();
    }
  },
};
