// 신청 서버의 /queue/* 를 그대로 중계한다.
//
// 브라우저가 4100 을 직접 부르면 CORS 를 열어야 하는데, 그건 이 데모가 다루려는 문제가 아니다.
// SSE 도 여기를 지나간다 — upstream 의 body 스트림을 그대로 흘려보내면 된다.

const SERVER = process.env.RUSH_SERVER_URL ?? "http://localhost:4100";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const upstream = await fetch(`${SERVER}/queue/${path.join("/")}`, { cache: "no-store" });

  if (path[0] === "stream") {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const body = await request.text();
  const upstream = await fetch(`${SERVER}/queue/${path.join("/")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body || "{}",
    cache: "no-store",
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
