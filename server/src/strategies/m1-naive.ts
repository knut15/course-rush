// M1 — 순진한 구현. **깨지는 것을 보여주기 위한 코드다.**
//
// 읽고(count) 판정하고(if) 쓰는(insert) 사이가 원자적이지 않다.
// 두 요청이 같은 순간에 count 를 읽으면 둘 다 "아직 자리 있음" 을 보고 둘 다 넣는다.
// 고전적인 TOCTOU(time-of-check to time-of-use) 다.
//
// UNIQUE(course_id, student_id) 는 이것을 막지 못한다. 그 제약이 막는 것은
// **같은 학생의 두 번째 신청**이지 **정원을 넘는 다른 학생**이 아니다.

import type pg from "pg";
import { isUniqueViolation } from "../db.js";
import type { Strategy } from "./types.js";

export const m1Naive: Strategy = {
  id: "M1",
  name: "순진한 구현",
  summary: "SELECT count → 애플리케이션에서 판정 → INSERT. 읽기와 쓰기 사이가 열려 있다.",

  async enroll(pool, { courseId, studentId }) {
    const course = await pool.query<{ capacity: number }>(
      "SELECT capacity FROM courses WHERE id = $1",
      [courseId],
    );
    const capacity = course.rows[0]?.capacity;
    if (capacity === undefined) throw new Error(`과목 ${courseId} 가 없습니다.`);

    const counted = await pool.query<{ n: number }>(
      "SELECT count(*)::bigint AS n FROM enrollments WHERE course_id = $1",
      [courseId],
    );
    const enrolled = counted.rows[0]?.n ?? 0;

    // ── 이 줄과 다음 INSERT 사이가 이 데모의 주인공이다 ──
    if (enrolled >= capacity) return { outcome: "full" };

    try {
      await pool.query("INSERT INTO enrollments (course_id, student_id) VALUES ($1, $2)", [
        courseId,
        studentId,
      ]);
      return { outcome: "enrolled" };
    } catch (e) {
      // 중복신청만 여기로 온다. 정원 초과는 여기로 오지 않는다 — 그래서 막히지 않는다.
      if (isUniqueViolation(e)) return { outcome: "duplicate" };
      throw e;
    }
  },
};
