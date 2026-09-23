// 응답시간 분포. **평균이 숨기는 것을 눈으로 보이게 하는 것**이 이 차트의 목적이므로
// 추이가 아니라 분포를 그린다(GOAL.md §8).
//
// 가로 그룹 막대다. 방식 이름이 길어 세로축에 두는 편이 읽기 쉽고,
// 백분위 셋은 같은 것의 정도 차이라 계열색이 아니라 한 hue 의 ordinal 램프를 쓴다.
//
// 축은 선형이다. 로그로 누르면 M3 가 M5 보다 10배 느리다는 사실이 시각적으로 사라진다 —
// 그 차이가 이 데모의 내용이다.
"use client";

import { useState } from "react";
import { PERCENTILES, type LoadResult } from "@/lib/types";

const BAR = 9; // thin marks
const GAP = 2; // 막대 사이 표면 간격
const GROUP_GAP = 16;
const LABEL_W = 46;
const RIGHT_PAD = 64;
const ROW = BAR * 3 + GAP * 2 + GROUP_GAP;

type Hover = { x: number; y: number; mode: string; label: string; value: number } | null;

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw)! * mag;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(Math.round(t));
  return ticks;
}

export function LatencyChart({ results }: { results: LoadResult[] }) {
  const [hover, setHover] = useState<Hover>(null);

  if (results.length === 0) return null;

  const max = Math.max(...results.flatMap((r) => [r.median.p50, r.median.p95, r.median.p99]));
  const ticks = niceTicks(max);
  const axisMax = ticks[ticks.length - 1] ?? max;

  const height = results.length * ROW + 28;
  const width = 720;
  const plotW = width - LABEL_W - RIGHT_PAD;
  const scale = (v: number) => (axisMax === 0 ? 0 : (v / axisMax) * plotW);

  return (
    <figure className="relative m-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-3 pb-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          응답시간 분포 <span style={{ color: "var(--text-muted)" }}>· 낮을수록 좋다</span>
        </h2>
        {/* 계열이 둘 이상이면 범례는 언제나 있다 */}
        <ul className="m-0 flex list-none gap-4 p-0 text-xs" style={{ color: "var(--text-secondary)" }}>
          {PERCENTILES.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ background: p.color }}
              />
              {p.label}
            </li>
          ))}
        </ul>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: height }}
        role="img"
        aria-label="방식별 응답시간 백분위 막대 그래프. 같은 수치가 아래 표에도 있다."
      >
        {/* 격자는 뒤로 물린다 */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={LABEL_W + scale(t)}
              x2={LABEL_W + scale(t)}
              y1={0}
              y2={height - 28}
              stroke="var(--rule)"
              strokeWidth={1}
            />
            <text
              x={LABEL_W + scale(t)}
              y={height - 10}
              textAnchor="middle"
              fontSize={11}
              fill="var(--text-muted)"
            >
              {t}
            </text>
          </g>
        ))}
        <text x={width - 4} y={height - 10} textAnchor="end" fontSize={11} fill="var(--text-muted)">
          ms
        </text>

        {results.map((r, i) => {
          const top = i * ROW + 8;
          return (
            <g key={r.mode}>
              <text
                x={0}
                y={top + (BAR * 3 + GAP * 2) / 2 + 4}
                fontSize={12}
                fontWeight={600}
                fill="var(--text-primary)"
              >
                {r.mode}
              </text>
              {PERCENTILES.map((p, j) => {
                const value = r.median[p.key];
                const w = scale(value);
                const y = top + j * (BAR + GAP);
                return (
                  <g key={p.key}>
                    <rect
                      x={LABEL_W}
                      y={y}
                      width={Math.max(w, 1)}
                      height={BAR}
                      rx={4}
                      fill={p.color}
                      onMouseEnter={(e) =>
                        setHover({
                          x: e.clientX,
                          y: e.clientY,
                          mode: r.mode,
                          label: p.label,
                          value,
                        })
                      }
                      onMouseMove={(e) =>
                        setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                    {/* 선택적 직접 라벨 — 가장 큰 값인 p99 에만 붙인다.
                        모든 막대에 숫자를 달면 그래프가 표가 된다. */}
                    {p.key === "p99" ? (
                      <text
                        x={LABEL_W + w + 6}
                        y={y + BAR - 1}
                        fontSize={11}
                        fill="var(--text-secondary)"
                        className="tabular"
                      >
                        {value}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {hover ? (
        <div
          className="pointer-events-none fixed z-10 rounded-md border px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: hover.x + 12,
            top: hover.y + 12,
            background: "var(--surface-1)",
            borderColor: "var(--rule)",
            color: "var(--text-primary)",
          }}
        >
          <strong>{hover.mode}</strong> {hover.label}{" "}
          <span className="tabular">{hover.value}ms</span>
        </div>
      ) : null}
    </figure>
  );
}
