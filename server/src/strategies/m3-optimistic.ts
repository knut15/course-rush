// M3 — 낙관적 락. **재시도 비용을 수치로 보여주는 코드다.**
//
// 잠그지 않는다. 대신 읽을 때 본 version 을 UPDATE 조건에 걸어,
// 그 사이 누가 고쳤으면 영향 행이 0 이 되게 한다. 0 이면 다시 읽고 다시 시도한다.
//
// "낙관적 락이 비관적 락보다 낫다" 는 **충돌이 드물 때만** 참이다.
// 수강신청은 한 행에 수천 건이 몰리는, 충돌이 가장 잦은 상황이다.
// 그래서 이 전략의 핵심 수치는 p99 가 아니라 **재시도 횟수**다.

import type pg from "pg";
import { isUniqueViolation } from "../db.js";
import type { Strategy } from "./types.js";

// 상한을 두지 않으면 경합이 심할 때 한 요청이 무한히 돈다.
const MAX_RETRY = 10;

export const m3Optimistic: Strategy = {
  id: "M3",
  name: "낙관적 락",
  summary: `읽을 때 본 version 을 UPDATE 조건에 건다. 충돌하면 다시 읽고 재시도한다(상한 ${MAX_RETRY}회).`,

  async enroll(pool, { courseId, studentId }) {
    const client = await pool.connect();
    try {
      for (let attempt = 0; ; attempt++) {
        // 읽기는 트랜잭션 밖이다. 여기서부터 잠그면 그것은 이미 비관적 락이다.
        const course = await client.query<{
          capacity: number;
          enrolled_count: number;
          version: number;
        }>("SELECT capacity, enrolled_count, version FROM courses WHERE id = $1", [courseId]);

        const row = course.rows[0];
        if (!row) throw new Error(`과목 ${courseId} 가 없습니다.`);
        if (row.enrolled_count >= row.capacity) return { outcome: "full", retries: attempt };

        await client.query("BEGIN");
        const updated = await client.query(
          `UPDATE courses SET enrolled_count = enrolled_count + 1, version = version + 1
           WHERE id = $1 AND version = $2`,
          [courseId, row.version],
        );

        if (updated.rowCount === 0) {
          // 읽고 쓰는 사이에 남이 먼저 고쳤다. 내 자리는 없다.
          await client.query("ROLLBACK");
          if (attempt >= MAX_RETRY) return { outcome: "conflict", retries: attempt };
          // 백오프를 넣지 않는다. 넣으면 충돌은 줄지만 지연이 늘어,
          // 다른 전략과 같은 조건으로 비교할 수 없게 된다.
          continue;
        }

        try {
          await client.query("INSERT INTO enrollments (course_id, student_id) VALUES ($1, $2)", [
            courseId,
            studentId,
          ]);
          await client.query("COMMIT");
          return { outcome: "enrolled", retries: attempt };
        } catch (e) {
          // 중복신청이면 방금 올린 enrolled_count 를 되돌려야 한다.
          // 같은 트랜잭션 안이므로 ROLLBACK 한 번이면 둘 다 없던 일이 된다 —
          // **트랜잭션으로 묶지 않았다면 여기서 자리가 샜다.**
          await client.query("ROLLBACK");
          if (isUniqueViolation(e)) return { outcome: "duplicate", retries: attempt };
          throw e;
        }
      }
    } finally {
      client.release();
    }
  },
};
