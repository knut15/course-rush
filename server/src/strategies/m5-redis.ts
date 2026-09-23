// M5 — Redis 선점. **가장 빠르고, 약점이 가장 분명한 전략이다.**
//
// 판정을 DB 에서 빼내 Redis 로 옮긴다. 정원 차감과 중복 검사를 Lua 스크립트 하나로 묶어
// 원자적으로 처리하고, 성공한 요청만 DB 에 기록한다.
// DB 는 더 이상 "정원을 지키는 곳" 이 아니라 "결과를 적는 곳" 이 된다.
//
// ── 약점을 먼저 적는다(GOAL.md §11-4) ────────────────────────────
//
// Redis 선점은 성공했는데 DB INSERT 가 실패하면 **좌석이 증발한다.**
// 아래 코드는 그 경우 releaseSeat 로 되돌리지만, 되돌리기 직전에 프로세스가 죽으면
// 되돌릴 사람이 없다. 그 자리는 아무도 앉지 못한 채 남는다.
//
// 실제 서비스에서 메우는 방법은 셋이다.
//   1. 멱등 키를 두고 재시도 — 같은 요청이 두 번 들어와도 한 번만 반영되게 한다
//   2. outbox 테이블 — 선점 사실을 DB 에 먼저 적고 나중에 정산한다
//   3. 재조정 배치 — 주기적으로 Redis 의 좌석 수와 DB 의 행 수를 맞춘다
//
// 이 데모는 셋 다 넣지 않는다. **넣지 않았다는 사실을 발표에서 말하는 것**이 목적이다.

import type pg from "pg";
import { isUniqueViolation } from "../db.js";
import { r, remainingKey, studentsKey } from "../redis.js";
import type { Strategy } from "./types.js";

export const m5Redis: Strategy = {
  id: "M5",
  name: "Redis 선점",
  summary: "Lua 스크립트가 중복 검사와 정원 차감을 원자적으로 한다. DB 는 결과만 적는다.",

  async enroll(pool, { courseId, studentId }) {
    const claimed = await r.claimSeat(
      remainingKey(courseId),
      studentsKey(courseId),
      String(studentId),
    );

    if (claimed === -2) return { outcome: "duplicate" };
    if (claimed === -1) return { outcome: "full" };

    try {
      await pool.query("INSERT INTO enrollments (course_id, student_id) VALUES ($1, $2)", [
        courseId,
        studentId,
      ]);
      return { outcome: "enrolled" };
    } catch (e) {
      // 여기서 되돌리지 않으면 좌석이 증발한다.
      await r
        .releaseSeat(remainingKey(courseId), studentsKey(courseId), String(studentId))
        .catch(() => {});
      if (isUniqueViolation(e)) return { outcome: "duplicate" };
      throw e;
    }
  },
};
