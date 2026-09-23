// 신청 서버가 아는 전략 목록을 그대로 흘린다.
// 화면이 전략을 하드코딩하면 서버에 M6 을 붙였을 때 화면만 모르게 된다.

const SERVER = process.env.RUSH_SERVER_URL ?? "http://localhost:4100";

export async function GET() {
  try {
    const res = await fetch(`${SERVER}/admin/strategies`, { cache: "no-store" });
    return Response.json(await res.json());
  } catch {
    return Response.json(
      { error: "신청 서버(4100)에 연결하지 못했습니다. pnpm dev:server 를 먼저 띄우세요." },
      { status: 503 },
    );
  }
}
