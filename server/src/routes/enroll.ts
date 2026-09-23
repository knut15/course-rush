// 신청 엔드포인트. 전략을 고르는 것 말고는 하는 일이 없다.

import { Router } from "express";
import { pool } from "../db.js";
import { strategies } from "../strategies/index.js";

export const enrollRouter = Router();

enrollRouter.post("/", async (req, res) => {
  const mode = String(req.query.mode ?? "M1");
  const strategy = strategies[mode];
  if (!strategy) {
    res.status(400).json({ error: `모르는 방식입니다: ${mode}` });
    return;
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
