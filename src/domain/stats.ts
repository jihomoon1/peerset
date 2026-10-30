// Summary statistics over peers (methodology §11). Only Reported and Derived values
// enter; NM, Missing ("—"), Unsupported and peers that failed to load are counted as
// excluded, each with its reason. With no valid value every statistic is null: a
// statistic of nothing is absent, never zero. Percentiles follow Excel's
// PERCENTILE.INC (linear interpolation, inclusive), so web and workbook match.

import { NM_REASON_TEXT } from "./nm";
import type { Metric } from "./types";

// "failed": the peer's fundamentals did not load.
export type StatInput =
  { kind: "metric"; metric: Metric } | { kind: "failed"; reason: string };

export interface StatEntry {
  ticker: string;
  input: StatInput;
}

export interface StatExclusion {
  ticker: string;
  status: "nm" | "missing" | "unsupported" | "failed";
  reason: string;
}

export interface MetricStats {
  mean: number | null;
  median: number | null;
  high: number | null;
  low: number | null;
  p25: number | null;
  p75: number | null;
  nValid: number;
  nExcluded: number;
  used: { ticker: string; value: number }[]; // in entry order
  excluded: StatExclusion[]; // in entry order
}

// PERCENTILE.INC on values already sorted ascending: rank = (n − 1) × p, then linear
// interpolation between the two neighbouring values.
export function percentileInc(
  sorted: readonly number[],
  p: number,
): number | null {
  if (sorted.length === 0) return null;
  const rank = (sorted.length - 1) * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return sorted[lower] + (rank - lower) * (sorted[upper] - sorted[lower]);
}

function exclusionOf(ticker: string, input: StatInput): StatExclusion | null {
  if (input.kind === "failed")
    return {
      ticker,
      status: "failed",
      reason: `failed to load: ${input.reason}`,
    };
  const m = input.metric;
  switch (m.status) {
    case "nm":
      return { ticker, status: "nm", reason: NM_REASON_TEXT[m.reason] };
    case "missing":
      return { ticker, status: "missing", reason: m.reason };
    case "unsupported":
      return { ticker, status: "unsupported", reason: m.reason.message };
    default:
      return Number.isFinite(m.value)
        ? null
        : {
            ticker,
            status: "unsupported",
            reason: "value is not a finite number",
          };
  }
}

export function summarize(entries: readonly StatEntry[]): MetricStats {
  const used: MetricStats["used"] = [];
  const excluded: StatExclusion[] = [];
  for (const { ticker, input } of entries) {
    const exclusion = exclusionOf(ticker, input);
    if (exclusion) excluded.push(exclusion);
    else if (input.kind === "metric" && "unit" in input.metric)
      used.push({ ticker, value: input.metric.value });
  }
  const sorted = used.map((u) => u.value).sort((a, b) => a - b);
  const n = sorted.length;
  return {
    mean: n ? sorted.reduce((sum, v) => sum + v, 0) / n : null,
    median: percentileInc(sorted, 0.5),
    high: n ? sorted[n - 1] : null,
    low: n ? sorted[0] : null,
    p25: percentileInc(sorted, 0.25),
    p75: percentileInc(sorted, 0.75),
    nValid: n,
    nExcluded: excluded.length,
    used,
    excluded,
  };
}
