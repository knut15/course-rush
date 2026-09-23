/** 부하 생성기가 --json=true 로 내보내는 모양. loadgen/src/run.ts 의 summary 와 같다. */
export type LoadResult = {
  mode: string;
  total: number;
  concurrency: number;
  capacity: number;
  repeat: number;
  median: {
    over: number;
    enrolledRows: number;
    duplicateStudents: number;
    conflict: number;
    retries: number;
    errors: number;
    rps: number;
    p50: number;
    p95: number;
    p99: number;
  };
  range: { over: [number, number]; p99: [number, number]; rps: [number, number] };
};

export type Strategy = { id: string; name: string; summary: string };

export const PERCENTILES = [
  { key: "p50", label: "p50", color: "var(--p50)" },
  { key: "p95", label: "p95", color: "var(--p95)" },
  { key: "p99", label: "p99", color: "var(--p99)" },
] as const;

export type PercentileKey = (typeof PERCENTILES)[number]["key"];
