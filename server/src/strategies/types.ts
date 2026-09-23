// 다섯 전략이 공유하는 인터페이스. 런타임에 갈아 끼우는 것이 이 데모의 전부다.

import type pg from "pg";

// "마감" 은 에러가 아니다. 규칙대로 거절한 정상 응답이다(GOAL.md §4).
// 이것을 에러로 세면 정원을 안 지키는 M1 이 에러율이 낮아 유리해 보인다.
//
// "conflict" 는 다르다 — M3(낙관적 락)가 재시도 상한을 다 쓰고도 자리를 잡지 못한 경우다.
// 자리가 없어서가 아니라 경합에 밀려서 실패한 것이므로 마감과 섞어 세면 안 된다.
// **이것은 실패로 센다.**
export type EnrollOutcome = "enrolled" | "full" | "duplicate" | "conflict";

export type EnrollResult = {
  outcome: EnrollOutcome;
  // M3 전용. 낙관적 락이 몇 번 되돌아갔는지를 재지 않으면
  // "낙관적 락이 항상 낫다" 를 반박할 근거가 없다.
  retries?: number;
};

export type Strategy = {
  id: string;
  name: string;
  /** 표와 슬라이드에 그대로 쓸 한 줄 */
  summary: string;
  enroll(pool: pg.Pool, input: { courseId: number; studentId: number }): Promise<EnrollResult>;
};
