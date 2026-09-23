// 대기열 엔드포인트.
//
// 화면은 SSE 로 순번을 받고, 부하 생성기는 폴링을 쓴다.
// 생성기가 1,000개의 SSE 연결을 열면 그 연결 자체가 부하가 되어 측정하려는 것을 가린다.

import { Router } from "express";
import { randomUUID } from "node:crypto";
import * as queue from "../queue.js";

export const queueRouter = Router();

queueRouter.post("/enter", async (req, res) => {
  const token = (req.body as { token?: string })?.token ?? randomUUID();
  res.json(await queue.enter(token));
});

// 폴링용. 부하 생성기가 이걸 쓴다.
queueRouter.get("/check/:token", async (req, res) => {
  res.json(await queue.check(req.params.token));
});

queueRouter.get("/stats", async (_req, res) => {
  res.json(await queue.stats());
});

queueRouter.post("/rate", async (req, res) => {
  const rate = Number((req.body as { rate?: unknown }).rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100_000) {
    res.status(400).json({ error: "rate 는 0 이상 100000 이하여야 합니다." });
    return;
  }
  await queue.setRate(rate);
  res.json({ rate });
});

queueRouter.post("/reset", async (_req, res) => {
  await queue.reset();
  res.json({ ok: true });
});

// 화면용 SSE. 순번이 줄어드는 것을 실시간으로 흘린다.
queueRouter.get("/stream/:token", async (req, res) => {
  const token = req.params.token;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // 프록시가 버퍼링하면 이벤트가 뭉쳐서 한꺼번에 도착한다. 그러면 실시간이 아니다.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const send = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  while (!closed) {
    const state = await queue.check(token);
    send("tick", state);
    if (state.admitted) {
      send("admitted", state);
      break;
    }
    if (state.rank === null) {
      // 대기열에도 없고 입장도 안 됐다 — 초기화됐거나 토큰이 틀렸다.
      send("gone", state);
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  res.end();
});
