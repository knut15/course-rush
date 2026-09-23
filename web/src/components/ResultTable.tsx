// 비교표. 차트가 못 담는 것(초과·중복·충돌·RPS)을 담고,
// 차트의 같은 수치를 글자로도 읽을 수 있게 하는 자리이기도 하다.
"use client";

import type { LoadResult, Strategy } from "@/lib/types";

const num = (n: number) => n.toLocaleString();

export function ResultTable({
  results,
  strategies,
}: {
  results: LoadResult[];
  strategies: Strategy[];
}) {
  if (results.length === 0) return null;
  const nameOf = (id: string) => strategies.find((s) => s.id === id)?.name ?? id;
  const repeated = results.some((r) => r.repeat > 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="pb-3 text-left text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          비교표
          <span className="pl-2 font-normal" style={{ color: "var(--text-muted)" }}>
            {repeated ? "반복 측정의 중앙값" : "1회 측정"} · 초과가 0이 아니면 나머지 수치는 의미가 없다
          </span>
        </caption>
        <thead>
          <tr style={{ color: "var(--text-secondary)" }}>
            <th className="border-b py-2 pr-3 text-left font-medium" style={{ borderColor: "var(--rule)" }}>
              방식
            </th>
            {["등록", "초과", "중복", "충돌", "p50", "p95", "p99", "RPS"].map((h) => (
              <th
                key={h}
                className="border-b py-2 pl-3 text-right font-medium"
                style={{ borderColor: "var(--rule)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {results.map((r) => {
            const m = r.median;
            const broken = m.over > 0;
            return (
              <tr key={r.mode}>
                <td className="border-b py-2 pr-3" style={{ borderColor: "var(--rule)" }}>
                  <span className="font-semibold">{r.mode}</span>
                  <span className="pl-2" style={{ color: "var(--text-muted)" }}>
                    {nameOf(r.mode)}
                  </span>
                </td>
                <td className="border-b py-2 pl-3 text-right" style={{ borderColor: "var(--rule)" }}>
                  {num(m.enrolledRows)}
                </td>
                {/* 초과는 상태값이다. 색만으로 알리지 않고 글자를 함께 붙인다. */}
                <td
                  className="border-b py-2 pl-3 text-right font-semibold"
                  style={{ borderColor: "var(--rule)", color: broken ? "var(--critical)" : undefined }}
                >
                  {broken ? `${num(m.over)} 초과` : "0"}
                  {broken && r.repeat > 1 ? (
                    <span className="block text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                      {r.range.over[0]}~{r.range.over[1]}
                    </span>
                  ) : null}
                </td>
                <td className="border-b py-2 pl-3 text-right" style={{ borderColor: "var(--rule)" }}>
                  {num(m.duplicateStudents)}
                </td>
                <td
                  className="border-b py-2 pl-3 text-right"
                  style={{ borderColor: "var(--rule)", color: m.conflict > 0 ? "var(--critical)" : undefined }}
                >
                  {m.conflict > 0 ? `${num(m.conflict)} 실패` : "0"}
                </td>
                <td className="border-b py-2 pl-3 text-right" style={{ borderColor: "var(--rule)" }}>
                  {m.p50}
                </td>
                <td className="border-b py-2 pl-3 text-right" style={{ borderColor: "var(--rule)" }}>
                  {m.p95}
                </td>
                <td className="border-b py-2 pl-3 text-right" style={{ borderColor: "var(--rule)" }}>
                  {m.p99}
                </td>
                <td className="border-b py-2 pl-3 text-right" style={{ borderColor: "var(--rule)" }}>
                  {num(m.rps)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        p50·p95·p99·RPS 는 밀리초와 초당 요청 수다. <strong>충돌</strong>은 낙관적 락이 재시도를
        다 쓰고도 자리를 못 잡은 수로, 마감이 아니라 실패다.
      </p>
    </div>
  );
}
