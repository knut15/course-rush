-- GOAL.md §7 — 데이터 모델
--
-- id 를 uuid 가 아니라 정수로 둔다. 부하 생성기가 학생 id 1..N 을 계산만으로 만들 수 있어야
-- 매 요청 전에 id 목록을 받아오는 왕복이 사라진다. 그 왕복은 측정하려는 대상이 아니다.

DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS courses;

CREATE TABLE courses (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  capacity       INT  NOT NULL,

  -- M3(낙관적 락)·M4(원자적 갱신) 전용 컬럼이다.
  -- M1·M2 는 이 값을 쓰지 않고 count(*) 로 센다 — 한 테이블에 두 방식이 공존하는 것이
  -- 비교의 조건이다(GOAL.md §7).
  enrolled_count INT  NOT NULL DEFAULT 0,
  version        INT  NOT NULL DEFAULT 0
);

CREATE TABLE students (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE enrollments (
  id         BIGSERIAL PRIMARY KEY,
  course_id  INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 중복신청을 막는 것은 이 제약이다. 정원은 막지 못한다 —
  -- 그 둘이 다른 문제라는 것이 M1 이 보여줄 것이다(GOAL.md §4).
  UNIQUE (course_id, student_id)
);

-- PostgreSQL 은 외래키에 인덱스를 자동으로 만들지 않는다. 제약과 인덱스는 다른 것이다.
CREATE INDEX enrollments_course_id_idx ON enrollments (course_id);
