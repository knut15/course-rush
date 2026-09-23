// 측정을 위한 엔드포인트. 초기화와 집계.
//
// 매 실행 전에 초기화하지 않으면 앞 실행의 등록이 남아 다음 실행이 곧바로 "마감" 이 된다.
// 초기화 여부가 결과를 바꾸면 그 측정은 못 쓴다(GOAL.md §6).

import { Router } from "express";
import { pool, poolSize, setPoolSize } from "../db.js";
import { redis, remainingKey, resetCourseSeats, studentsKey } from "../redis.js";
import { strategyList } from "../strategies/index.js";

export const adminRouter = Router();

adminRouter.get("/strategies", (_req, res) => {
  res.json({ strategies: strategyList(), poolSize: poolSize() });
});

adminRouter.post("/reset", async (_req, res) => {
  // TRUNCATE 는 DELETE 보다 빠르고 시퀀스도 되돌린다.
  await pool().query("TRUNCATE enrollments RESTART IDENTITY");
  await pool().query("UPDATE courses SET enrolled_count = 0, version = 0");

  // Redis 좌석도 함께 되돌린다. 빠뜨리면 M5 측정이 앞 실행의 잔여 좌석을 이어받아
  // 시작하자마자 "마감" 이 된다 — 그리고 그 사실이 수치에 드러나지 않는다.
  const courses = await pool().query<{ id: number; capacity: number }>(
    "SELECT id, capacity FROM courses",
  );
  await Promise.all(courses.rows.map((c) => resetCourseSeats(c.id, c.capacity)));

  res.json({ ok: true });
});

adminRouter.post("/pool", async (req, res) => {
  const size = Number((req.body as { size?: unknown }).size);
  if (!Number.isInteger(size) || size < 1 || size > 190) {
    // DB 의 max_connections 가 200 이다. 여유를 두고 190 에서 막는다.
    res.status(400).json({ error: "size 는 1 이상 190 이하의 정수여야 합니다." });
    return;
  }
  await setPoolSize(size);
  res.json({ poolSize: poolSize() });
});

// 정원을 바꾼다. 정원 50 에 1만 요청을 던지면 99.5% 가 "마감" 경로라
// 재는 것이 자리다툼이 아니라 **마감 판정 비용**이 된다. 경합이 긴 구간을 보려면
// 정원을 요청 수에 가깝게 올려야 한다.
adminRouter.post("/capacity", async (req, res) => {
  const capacity = Number((req.body as { capacity?: unknown }).capacity);
  const courseId = Number((req.body as { courseId?: unknown }).courseId ?? 1);
  if (!Number.isInteger(capacity) || capacity < 1) {
    res.status(400).json({ error: "capacity 는 1 이상의 정수여야 합니다." });
    return;
  }
  await pool().query("UPDATE courses SET capacity = $1 WHERE id = $2", [capacity, courseId]);
  // 정원을 바꾸면 Redis 쪽 좌석도 같이 맞춘다. 한쪽만 바꾸면 M5 가 옛 정원으로 돈다.
  await resetCourseSeats(courseId, capacity);
  res.json({ courseId, capacity });
});

adminRouter.get("/stats", async (req, res) => {
  const courseId = Number(req.query.courseId ?? 1);

  const course = await pool().query<{ capacity: number; enrolled_count: number; version: number }>(
    "SELECT capacity, enrolled_count, version FROM courses WHERE id = $1",
    [courseId],
  );
  const rows = await pool().query<{ n: number }>(
    "SELECT count(*)::bigint AS n FROM enrollments WHERE course_id = $1",
    [courseId],
  );

  // 같은 (course, student) 가 2건 이상인 경우. UNIQUE 제약이 있으니 0 이어야 한다 —
  // 0 이 아니면 제약이 빠진 것이므로 측정이 아니라 스키마를 의심한다.
  const dup = await pool().query<{ n: number }>(
    `SELECT count(*)::bigint AS n FROM (
       SELECT student_id FROM enrollments WHERE course_id = $1
       GROUP BY student_id HAVING count(*) > 1
     ) d`,
    [courseId],
  );

  const capacity = course.rows[0]?.capacity ?? 0;
  const actual = rows.rows[0]?.n ?? 0;

  // Redis 쪽 좌석 상태. M5 가 선점한 수와 DB 에 적힌 수가 어긋나면
  // 그것이 곧 "좌석 증발" 의 흔적이다.
  const [remainingRaw, claimed] = await Promise.all([
    redis.get(remainingKey(courseId)).catch(() => null),
    redis.scard(studentsKey(courseId)).catch(() => 0),
  ]);
  const remaining = remainingRaw === null ? null : Number(remainingRaw);

  res.json({
    courseId,
    capacity,
    // 진짜 등록 건수는 테이블 행 수다. enrolled_count 컬럼은 M3·M4 가 관리하는 값이라
    // 둘이 어긋나는 것 자체가 버그의 신호다.
    enrolledRows: actual,
    enrolledCountColumn: course.rows[0]?.enrolled_count ?? 0,
    version: course.rows[0]?.version ?? 0,
    // 초과. 0 이 아니면 나머지 수치는 의미가 없다(GOAL.md §4).
    over: Math.max(0, actual - capacity),
    duplicateStudents: dup.rows[0]?.n ?? 0,
    redis: {
      remaining,
      claimed,
      // Redis 가 선점했다고 본 수와 DB 에 실제로 적힌 수의 차. 0 이어야 한다.
      leaked: remaining === null ? null : claimed - actual,
    },
  });
});
