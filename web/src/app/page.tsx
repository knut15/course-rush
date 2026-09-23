"use client";

import { useEffect, useState } from "react";
import { LatencyChart } from "@/components/LatencyChart";
import { ResultTable } from "@/components/ResultTable";
import type { LoadResult, Strategy } from "@/lib/types";

const ALL = ["M1", "M2", "M3", "M4", "M5"];

type Form = {
  total: number;
  concurrency: number;
  capacity: number;
  students: number;
  pool: number;
  repeat: number;
};

const DEFAULTS: Form = {
  total: 10000,
  concurrency: 1000,
  capacity: 50,
  students: 10000,
  pool: 20,
  repeat: 1,
};

export default function Page() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(ALL);
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [results, setResults] = useState<LoadResult[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strategies")
      .then((r) => r.json())
      .then((d: { strategies?: Strategy[]; error?: string }) => {
        if (d.error) setServerError(d.error);
        else setStrategies(d.strategies ?? []);
      })
      .catch(() => setServerError("신청 서버 상태를 확인하지 못했습니다."));
  }, []);

  // 방식을 하나씩 순차로 돌린다. 동시에 던지면 서로의 부하가 되어 모든 수치가 오염된다.
  async function fire() {
    setResults([]);
    setError(null);
    for (const mode of ALL.filter((m) => picked.includes(m))) {
      setRunning(mode);
      try {
        const res = await fetch("/api/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, ...form }),
        });
        const data = (await res.json()) as LoadResult & { error?: string };
        if (data.error) {
          setError(data.error);
          break;
        }
        setResults((prev) => [...prev, data]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "요청이 실패했습니다.");
        break;
      }
    }
    setRunning(null);
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }));

  const busy = running !== null;

  return (
    <main className="mx-auto w-full max-w-[56rem] px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">수강신청 동시성</h1>
        <p className="max-w-[46rem] pt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          정원이 정해진 과목에 요청이 한꺼번에 몰릴 때 무엇이 깨지는지 보는 데모다. 같은 부하를
          다섯 가지 구현에 차례로 던지고 <strong>정원을 넘겨 등록된 건수</strong>와 응답시간을 비교한다.
          동시성을 1로 두면 아무것도 깨지지 않는다 — 요청 수가 아니라 동시성이 원인이기 때문이다.
        </p>
      </header>

      {serverError ? (
        <p
          className="mt-8 rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: "var(--critical)", color: "var(--critical)" }}
        >
          {serverError}
        </p>
      ) : null}

      {/* 조건은 차트 위 한 줄에 둔다 */}
      <section
        className="mt-10 rounded-lg border p-5"
        style={{ borderColor: "var(--rule)", background: "var(--surface-1)" }}
      >
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          {(
            [
              ["총 요청", "total", 1, 200000],
              ["동시성", "concurrency", 1, 5000],
              ["정원", "capacity", 1, 100000],
              ["학생 수", "students", 1, 10000],
              ["DB 풀", "pool", 1, 190],
              ["반복", "repeat", 1, 9],
            ] as const
          ).map(([label, key, min, max]) => (
            <label key={key} className="flex flex-col gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              {label}
              <input
                type="number"
                min={min}
                max={max}
                value={form[key]}
                onChange={set(key)}
                disabled={busy}
                className="tabular w-24 rounded-md border px-2 py-1.5 text-sm"
                style={{
                  borderColor: "var(--rule)",
                  background: "var(--surface-0)",
                  color: "var(--text-primary)",
                }}
              />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 pt-5">
          <fieldset className="m-0 border-0 p-0">
            <legend className="pb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              방식
            </legend>
            <div className="flex flex-wrap gap-3">
              {ALL.map((id) => {
                const s = strategies.find((x) => x.id === id);
                return (
                  <label key={id} className="flex items-center gap-1.5 text-sm" title={s?.summary}>
                    <input
                      type="checkbox"
                      checked={picked.includes(id)}
                      disabled={busy}
                      onChange={(e) =>
                        setPicked((p) => (e.target.checked ? [...p, id] : p.filter((x) => x !== id)))
                      }
                    />
                    <span className="font-semibold">{id}</span>
                    <span style={{ color: "var(--text-muted)" }}>{s?.name ?? ""}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={fire}
            disabled={busy || picked.length === 0 || serverError !== null}
            className="rounded-md px-5 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--text-primary)", color: "var(--surface-1)" }}
          >
            {busy ? `${running} 측정 중` : "부하 던지기"}
          </button>
        </div>

        <p className="pt-4 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          매 측정 전에 등록을 초기화하고 워밍업 한 번을 버린다. 정원을 총 요청 수에 가깝게 올리면
          마감 판정이 아니라 <strong>자리다툼 자체</strong>를 재게 된다. 학생 수를 정원보다 작게 하면
          중복신청 경로가 열린다.
        </p>
      </section>

      {busy ? (
        <p className="pt-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          {running} 측정 중… ({results.length}/{picked.length} 완료)
        </p>
      ) : null}

      {error ? (
        <p className="pt-6 text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}

      {results.length > 0 ? (
        <>
          <section className="pt-12">
            <ResultTable results={results} strategies={strategies} />
          </section>
          <section className="pt-12">
            <LatencyChart results={results} />
          </section>
          <p className="pt-10 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            측정 환경 — 10코어 / 16GB / macOS, 신청 서버·PostgreSQL·Redis·부하 생성기가 전부 한 머신에서
            돈다. 동시 커넥션 {form.concurrency.toLocaleString()}개가 아니라 <strong>총{" "}
            {form.total.toLocaleString()}개 요청을 동시 {form.concurrency.toLocaleString()}로 유지하며</strong>{" "}
            던진 결과다. 서버가 빠른 방식일수록 부하 생성기 쪽이 병목이 되므로 RPS 절대값은 상대 비교로만 읽는다.
          </p>
        </>
      ) : null}
    </main>
  );
}
