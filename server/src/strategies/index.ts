import type { Strategy } from "./types.js";
import { m1Naive } from "./m1-naive.js";
import { m2Pessimistic } from "./m2-pessimistic.js";
import { m3Optimistic } from "./m3-optimistic.js";
import { m4Atomic } from "./m4-atomic.js";
import { m5Redis } from "./m5-redis.js";

const all: Strategy[] = [m1Naive, m2Pessimistic, m3Optimistic, m4Atomic, m5Redis];

export const strategies: Record<string, Strategy> = Object.fromEntries(
  all.map((s) => [s.id, s]),
);

export const strategyList = () => all.map((s) => ({ id: s.id, name: s.name, summary: s.summary }));
