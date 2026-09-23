// 응답시간 집계. **평균은 내지 않는다**(GOAL.md §4) —
// 평균은 소수의 느린 요청을 숨기고, 이 데모가 보여주려는 것이 바로 그 소수다.

export type Percentiles = { p50: number; p95: number; p99: number; max: number };

export function percentiles(samplesMs: number[]): Percentiles {
  if (samplesMs.length === 0) return { p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const at = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)] ?? 0;
  };
  return { p50: at(50), p95: at(95), p99: at(99), max: sorted[sorted.length - 1] ?? 0 };
}

export const round = (n: number, digits = 1) => Number(n.toFixed(digits));

// 중앙값. 반복 측정에서 평균 대신 이것을 쓴다 —
// 한 회차가 크게 튀면 평균은 그 회차를 따라가지만 중앙값은 버틴다.
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}
