// 신청 엔드포인트. 전략을 고르는 것 말고는 하는 일이 없다.

import { Router } from "express";
import { pool } from "../db.js";
import { strategies } from "../strategies/index.js";
import { isAdmitted } from "../queue.js";

export const enrollRouter = Router();

enrollRouter.post("/", async (req, res) => {
  const mode = String(req.query.mode ?? "M1");
  const strategy = strategies[mode];
  if (!strategy) {
    res.status(400).json({ error: `모르는 방식입니다: ${mode}` });
    return;
  }

  // 대기열을 거치게 할지는 요청이 정한다. 1~5단계 측정은 대기열 없이 재야 하므로
  // 기본은 통과이고, ?queue=1 일 때만 입장 토큰을 본다.
  if (req.query.queue === "1") {
    const token = req.header("x-admission-token");
    if (!token || !(await isAdmitted(token))) {
      // 429 — 지금은 안 되지만 기다리면 된다는 뜻이다. 403 이 아니다.
      res.status(429).json({ outcome: "not-admitted", error: "입장 토큰이 없습니다." });
      return;
    }
  }

  const { courseId, studentId } = req.body as { courseId?: number; studentId?: number };
  if (typeof courseId !== "number" || typeof studentId !== "number") {
    res.status(400).json({ error: "courseId 와 studentId 는 숫자여야 합니다." });
    return;
  }

  const result = await strategy.enroll(pool(), { courseId, studentId });

  // 상태 코드로도 outcome 으로도 구분할 수 있게 둘 다 싣는다.
  // 부하 생성기는 outcome 으로 집계한다 — 409 하나로 뭉치면 마감과 중복이 섞인다.
  const status = result.outcome === "enrolled" ? 201 : 409;
  res.status(status).json(result);
});
