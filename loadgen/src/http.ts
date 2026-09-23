// keep-alive 를 켜고 소켓을 재사용한다. 끄면 요청마다 TCP 수립 비용이 들어가고,
// 그러면 재는 것이 신청 처리 시간이 아니라 커넥션 수립 시간이 된다(GOAL.md §6).

import http from "node:http";

export type PostResult = { status: number; body: unknown; ms: number };

export function makeAgent(maxSockets: number): http.Agent {
  return new http.Agent({ keepAlive: true, maxSockets, maxFreeSockets: maxSockets });
}

export function post(
  agent: http.Agent,
  url: URL,
  payload: unknown,
  timeoutMs: number,
): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const startedAt = performance.now();

    const req = http.request(
      {
        agent,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": data.length },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const ms = performance.now() - startedAt;
          let body: unknown = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            body = null;
          }
          resolve({ status: res.statusCode ?? 0, body, ms });
        });
      },
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(data);
  });
}

export async function simple(method: "POST" | "GET", url: URL, payload?: unknown): Promise<unknown> {
  const data = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: data ? { "Content-Type": "application/json", "Content-Length": data.length } : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}
