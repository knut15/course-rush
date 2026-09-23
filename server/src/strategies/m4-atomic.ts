// M4 — DB 원자적 갱신. **대부분의 실무 답이 여기다.**
//
// 읽기·판정·쓰기를 애플리케이션이 나눠 하지 않고 UPDATE 한 문장 안에서 끝낸다.
// `WHERE enrolled_count < capacity` 가 판정이고, 영향 행이 0 이면 마감이다.
// 잠그지도 않고 재시도하지도 않는다 — PostgreSQL 이 같은 행에 대한 UPDATE 를
// 알아서 직렬화하고, 그 단위가 문장 하나라 잡고 있는 시간이 짧다.
//
// 주의 — 정원만 있었다면 이 전략은 트랜잭션조차 필요 없었다.
// **중복신청 규칙 하나가 트랜잭션을 불러온다.** INSERT 가 UNIQUE 위반으로 실패하면
// 이미 올린 enrolled_count 를 되돌려야 하기 때문이다(GOAL.md §4).

import type pg from "pg";
import { isUniqueViolation } from "../db.js";
import type { Strategy } from "./types.js";

export const m4Atomic: Strategy = {
  id: "M4",
  name: "DB 원자적 갱신",
  summary: "UPDATE ... WHERE enrolled_count < capacity 한 문장이 판정과 확보를 함께 한다.",

  async enroll(pool, { courseId, studentId }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const claimed = await client.query<{ enrolled_count: number }>(
        `UPDATE courses SET enrolled_count = enrolled_count + 1
         WHERE id = $1 AND enrolled_count < capacity
         RETURNING enrolled_count`,
        [courseId],
      );

      if (claimed.rowCount === 0) {
        await client.query("ROLLBACK");
        return { outcome: "full" };
      }

      try {
        await client.query("INSERT INTO enrollments (course_id, student_id) VALUES ($1, $2)", [
          courseId,
          studentId,
        ]);
        await client.query("COMMIT");
        return { outcome: "enrolled" };
      } catch (e) {
        await client.query("ROLLBACK");
        if (isUniqueViolation(e)) return { outcome: "duplicate" };
        throw e;
      }
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },
};
