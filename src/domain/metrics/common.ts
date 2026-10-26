// Shared plumbing for the LTM metrics (methodology §3): an LTM result becomes a
// Metric whose inputs are the exact facts used.

import type { LtmResult } from "../ltm";
import type {
  LTMCalculation,
  Metric,
  MetricWarning,
  ReportedFinancialFact,
  Unit,
} from "../types";

export interface LtmMetricResult {
  metric: Metric;
  ltm?: LTMCalculation;
}

export const LTM_FORMULA = {
  annual: "LTM = fiscal year (latest 10-K)",
  fy_plus_ytd_minus_prior_ytd: "LTM = FY + current YTD − prior-year YTD",
} as const;

export function componentsOf(calc: LTMCalculation): ReportedFinancialFact[] {
  return [calc.fy, calc.ytdCurrent, calc.ytdPrior].filter(
    (f): f is ReportedFinancialFact => f !== undefined,
  );
}

// After a 10-K the value is the filed annual figure (reported); after a 10-Q it is
// computed from three facts (derived).
export function ltmMetric(
  r: LtmResult,
  unit: Unit,
  extraWarnings: MetricWarning[] = [],
): LtmMetricResult {
  if (r.kind === "unsupported")
    return {
      metric: {
        status: "unsupported",
        reason: r.reason,
        warnings: [...r.warnings, ...extraWarnings],
      },
      ltm: r.calc,
    };
  return {
    metric: {
      status: r.calc.method === "annual" ? "reported" : "derived",
      value: r.value,
      unit,
      period: r.period,
      formula: `${LTM_FORMULA[r.calc.method]} (${r.calc.concept})`,
      inputs: componentsOf(r.calc),
      warnings: [...r.warnings, ...extraWarnings],
    },
    ltm: r.calc,
  };
}

// Warnings from several inputs, once per code and message.
export function mergeWarnings(...lists: MetricWarning[][]): MetricWarning[] {
  const seen = new Set<string>();
  const out: MetricWarning[] = [];
  for (const w of lists.flat()) {
    const key = `${w.code}|${w.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export type Usable = Extract<Metric, { status: "reported" | "derived" }>;

export function isUsable(m: Metric): m is Usable {
  return m.status === "reported" || m.status === "derived";
}

// A derived metric whose inputs aren't all usable: Missing if any input is Missing,
// otherwise Unsupported naming the first unusable input. Never zero.
export function unusableInputs(
  what: string,
  inputs: [string, Metric][],
): Metric | null {
  const bad = inputs.filter(([, m]) => !isUsable(m));
  if (bad.length === 0) return null;
  const warnings = mergeWarnings(...inputs.map(([, m]) => m.warnings));
  const missing = bad.find(([, m]) => m.status === "missing");
  if (missing)
    return {
      status: "missing",
      reason: `${what} needs ${missing[0]}, which is missing`,
      warnings,
    };
  const [name, m] = bad[0];
  const why =
    m.status === "unsupported"
      ? m.reason.message
      : m.status === "nm"
        ? `NM (${m.reason})`
        : "";
  return {
    status: "unsupported",
    reason: {
      code: "INPUT_UNSUPPORTED",
      message: `${what} needs ${name}, which is ${m.status}: ${why}`,
    },
    warnings,
  };
}
