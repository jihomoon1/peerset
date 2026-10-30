// Implied valuation (methodology §13): the target's LTM metric × the peers' 25th
// percentile, median and 75th percentile multiple gives an implied EV; minus debt plus
// cash gives implied equity; ÷ shares gives an implied price. Shown only when every
// target input is valid: an invalid input makes the result Unsupported with the reason,
// never a number (status Unsupported, methodology §1). The target's own price is not an input.

import type { MetricStats } from "./stats";
import type { Metric } from "./types";

export const IMPLIED_MULTIPLES = [
  {
    key: "evEbitda",
    label: "EV/EBITDA",
    metric: "ebitda",
    metricLabel: "LTM EBITDA",
  },
  {
    key: "evRevenue",
    label: "EV/Revenue",
    metric: "revenue",
    metricLabel: "LTM revenue",
  },
] as const;
export type ImpliedMultiple = (typeof IMPLIED_MULTIPLES)[number]["key"];

export const IMPLIED_POINTS = ["p25", "median", "p75"] as const;
export type ImpliedPoint = (typeof IMPLIED_POINTS)[number];

export interface ImpliedValue {
  multiple: number;
  impliedEv: number;
  impliedEquity: number;
  impliedPrice: number;
}

export type ImpliedResult =
  | {
      status: "ok";
      metricValue: number;
      totalDebt: number;
      cash: number;
      shares: number;
      nPeers: number;
      points: Record<ImpliedPoint, ImpliedValue>;
    }
  | { status: "unsupported"; reason: string };

export interface ImpliedInput {
  revenue: Metric;
  ebitda: Metric;
  totalDebt: Metric;
  cash: Metric;
  shares: number[]; // one count per share class
  stats: Record<ImpliedMultiple, MetricStats>;
}

const usable = (m: Metric): number | null =>
  m.status === "reported" || m.status === "derived" ? m.value : null;

const STATUS_TEXT = {
  nm: "NM",
  missing: "missing",
  unsupported: "Unsupported",
} as const;

function why(label: string, m: Metric): string {
  return m.status === "reported" || m.status === "derived"
    ? ""
    : `${label} is ${STATUS_TEXT[m.status]}`;
}

export function impliedValuation(
  input: ImpliedInput,
): Record<ImpliedMultiple, ImpliedResult> {
  const debt = usable(input.totalDebt);
  const cash = usable(input.cash);
  const common =
    debt === null
      ? why("Total debt", input.totalDebt)
      : cash === null
        ? why("Cash and short-term investments", input.cash)
        : input.shares.length === 0
          ? "no cover-page share count"
          : input.shares.length > 1
            ? "several share classes: one implied price can't be split across classes"
            : null;

  const one = (spec: (typeof IMPLIED_MULTIPLES)[number]): ImpliedResult => {
    if (common) return { status: "unsupported", reason: common };
    const metric = input[spec.metric];
    const value = usable(metric);
    if (value === null)
      return { status: "unsupported", reason: why(spec.metricLabel, metric) };
    if (value <= 0)
      return {
        status: "unsupported",
        reason: `${spec.metricLabel} is not positive`,
      };
    const s = input.stats[spec.key];
    if (s.nValid === 0)
      return {
        status: "unsupported",
        reason: `no peer has a valid ${spec.label}`,
      };
    const shares = input.shares[0];
    const point = (multiple: number): ImpliedValue => {
      const impliedEv = value * multiple;
      const impliedEquity = impliedEv - debt! + cash!;
      return {
        multiple,
        impliedEv,
        impliedEquity,
        impliedPrice: impliedEquity / shares,
      };
    };
    return {
      status: "ok",
      metricValue: value,
      totalDebt: debt!,
      cash: cash!,
      shares,
      nPeers: s.nValid,
      points: {
        p25: point(s.p25!),
        median: point(s.median!),
        p75: point(s.p75!),
      },
    };
  };

  return {
    evEbitda: one(IMPLIED_MULTIPLES[0]),
    evRevenue: one(IMPLIED_MULTIPLES[1]),
  };
}
