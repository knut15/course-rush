import express from "express";
import { enrollRouter } from "./routes/enroll.js";
import { adminRouter } from "./routes/admin.js";
import { queueRouter } from "./routes/queue.js";
import { startAdmissionWorker } from "./queue.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/enroll", enrollRouter);
  app.use("/admin", adminRouter);
  app.use("/queue", queueRouter);

  // 앞에서부터 정해진 속도로 입장시키는 워커. 앱이 뜨면 함께 돈다.
  startAdmissionWorker();

  // Express 5 는 async 핸들러가 던진 것도 여기로 보낸다.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[unhandled]", err);
    if (!res.headersSent) res.status(500).json({ error: "서버에서 문제가 생겼습니다." });
  });

  return app;
}
