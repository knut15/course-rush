"use client";

// 대기열 시연. **대기열이 지키는 것은 신청 서버가 아니라 DB 다.**
// 슬라이더로 유입 속도를 바꾸면 줄이 줄어드는 속도가 그 자리에서 달라진다.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Tick = {
  admitted: boolean;
  rank: number | null;
  ahead: number;
  waiting: number;
  rate: number;
  etaSec: number | null;
};

type QueueStats = { waiting: number; rate: number; admitted: number };

export default function QueuePage() {
  const [rate, setRate] = useState(200);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [tick, setTick] = useState<Tick | null>(null);
  const [standing, setStanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // 전체 현황은 가볍게 폴링한다. 이 화면에 필요한 것은 두 숫자뿐이다.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/queue/stats", { cache: "no-store" });
        const d = (await r.json()) as QueueStats;
        if (alive) {
          setStats(d);
          setError(null);
        }
      } catch {
        if (alive) setError("신청 서버(4100)에 연결하지 못했습니다.");
      }
    };
    void poll();
    const id = setInterval(poll, 500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => () => esRef.current?.close(), []);

  async function changeRate(next: number) {
    setRate(next);
    await fetch("/api/queue/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rate: next }),
    });
  }

  async function standInLine() {
    esRef.current?.close();
    setTick(null);
    setStanding(true);

    const token = crypto.randomUUID();
    await fetch("/api/queue/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    // 내 순번만 SSE 로 받는다. 순번이 줄어드는 것을 눈으로 보는 것이 이 화면의 전부다.
    const es = new EventSource(`/api/queue/stream/${token}`);
    esRef.current = es;
    es.addEventListener("tick", (e) => setTick(JSON.parse((e as MessageEvent).data) as Tick));
    es.addEventListener("admitted", (e) => {
      setTick(JSON.parse((e as MessageEvent).data) as Tick);
      setStanding(false);
      es.close();
    });
    es.addEventListener("gone", () => {
      setStanding(false);
      es.close();
    });
    es.onerror = () => {
      setStanding(false);
      es.close();
    };
  }

  async function fillLine(n: number) {
    // 줄을 채워 놓아야 순번이 줄어드는 것이 보인다.
    await Promise.all(
      Array.from({ length: n }, () =>
        fetch("/api/queue/enter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: crypto.randomUUID() }),
        }),
      ),
    );
  }

  return (
    <main className="mx-auto w-full max-w-[52rem] px-6 py-12">
      <p className="pb-6 text-sm">
        <Link href="/" style={{ color: "var(--text-muted)" }}>
          ← 비교 데모로
        </Link>
      </p>

      <h1 className="text-2xl font-semibold tracking-tight">대기열</h1>
      <p className="max-w-[44rem] pt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        대기열이 지키는 것은 신청 서버가 아니라 <strong>DB</strong> 다. 하는 일은 초당 몇 명까지
        DB 에 닿게 할지 정하는 것뿐이고, 그 숫자를 바꾸면 <strong>대기 시간과 신청 지연이
        반대 방향으로</strong> 움직인다.
      </p>

      {error ? (
        <p className="mt-6 text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}

      <section
        className="mt-10 rounded-lg border p-6"
        style={{ borderColor: "var(--rule)", background: "var(--surface-1)" }}
      >
        <div className="flex flex-wrap gap-10">
          <div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              대기 중
            </div>
            <div className="tabular pt-1 text-3xl font-semibold">
              {stats?.waiting.toLocaleString() ?? "–"}
            </div>
          </div>
          <div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              입장 완료
            </div>
            <div className="tabular pt-1 text-3xl font-semibold">
              {stats?.admitted.toLocaleString() ?? "–"}
            </div>
          </div>
          <div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              유입 속도
            </div>
            <div className="tabular pt-1 text-3xl font-semibold">
              {stats?.rate.toLocaleString() ?? "–"}
              <span className="pl-1 text-base font-normal" style={{ color: "var(--text-muted)" }}>
                /초
              </span>
            </div>
          </div>
        </div>

        <label className="mt-8 block">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            유입 속도 — 낮출수록 DB 는 한가해지고 사람은 오래 기다린다
          </span>
          <input
            type="range"
            min={10}
            max={3000}
            step={10}
            value={rate}
            onChange={(e) => void changeRate(Number(e.target.value))}
            className="mt-3 w-full"
          />
          <span className="tabular text-sm" style={{ color: "var(--text-muted)" }}>
            {rate.toLocaleString()} /초
          </span>
        </label>

        <div className="flex flex-wrap gap-3 pt-6">
          <button
            type="button"
            onClick={() => void fillLine(500)}
            className="rounded-md border px-4 py-2 text-sm"
            style={{ borderColor: "var(--rule)", color: "var(--text-primary)" }}
          >
            500명 줄 세우기
          </button>
          <button
            type="button"
            onClick={() => void fetch("/api/queue/reset", { method: "POST" })}
            className="rounded-md border px-4 py-2 text-sm"
            style={{ borderColor: "var(--rule)", color: "var(--text-primary)" }}
          >
            줄 비우기
          </button>
          <button
            type="button"
            onClick={() => void standInLine()}
            disabled={standing}
            className="rounded-md px-5 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--text-primary)", color: "var(--surface-1)" }}
          >
            {standing ? "줄 서는 중" : "내가 줄 서 보기"}
          </button>
        </div>
      </section>

      {tick ? (
        <section
          className="mt-8 rounded-lg border p-6"
          style={{
            borderColor: tick.admitted ? "var(--good)" : "var(--rule)",
            background: "var(--surface-1)",
          }}
        >
          {tick.admitted ? (
            <p className="text-lg font-semibold" style={{ color: "var(--good)" }}>
              입장했습니다. 이제 신청할 수 있습니다.
            </p>
          ) : (
            <>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                앞에 있는 사람
              </p>
              <p className="tabular pt-1 text-4xl font-semibold">
                {tick.ahead.toLocaleString()}
                <span className="pl-2 text-base font-normal" style={{ color: "var(--text-muted)" }}>
                  명
                </span>
              </p>
              <p className="pt-3 text-sm" style={{ color: "var(--text-muted)" }}>
                지금 속도({tick.rate.toLocaleString()}/초)라면 약{" "}
                <strong className="tabular">{tick.etaSec ?? "–"}</strong>초
              </p>
            </>
          )}
        </section>
      ) : null}

      <section className="pt-14">
        <h2 className="text-sm font-semibold">유입 속도를 바꾸면 생기는 일</h2>
        <p className="pt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          M4 · 총 2,000 요청 · 동시 500 · 정원 5,000 · 10코어 16GB 로컬에서 실측한 값이다.
        </p>
        <div className="overflow-x-auto pt-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ color: "var(--text-secondary)" }}>
                <th className="border-b py-2 pr-3 text-left font-medium" style={{ borderColor: "var(--rule)" }}>
                  유입 속도
                </th>
                {["신청 p50", "신청 p99", "대기 p50", "대기 p99"].map((h) => (
                  <th key={h} className="border-b py-2 pl-3 text-right font-medium" style={{ borderColor: "var(--rule)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {[
                ["200/초", "13.0", "96.7", "2,415", "2,625"],
                ["500/초", "7.9", "185.8", "1,004", "1,119"],
                ["1,000/초", "460.5", "584.4", "202", "579"],
                ["5,000/초", "478.1", "661.7", "202", "316"],
                ["대기열 없음", "525.8", "701.2", "–", "–"],
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={i === 0 ? "border-b py-2 pr-3" : "border-b py-2 pl-3 text-right"}
                      style={{ borderColor: "var(--rule)" }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pt-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          유입을 200/초로 조이면 신청 p99 가 <strong>701ms 에서 97ms 로</strong> 떨어진다. 대신
          줄 선 사람은 2.6초를 기다린다. <strong>지연을 없앤 것이 아니라 옮긴 것이다</strong> —
          DB 안에서 기다리던 것을 대기열에서 기다리게 바꿨고, 그쪽이 훨씬 싸다.
        </p>
      </section>
    </main>
  );
}
