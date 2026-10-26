// How metrics and facts are shown on screen (blueprint §6). Pure, so it is tested
// without a browser; components only call these.

import type { MetricKey } from "@/domain/fundamentals";
import type { Metric, ReportedFinancialFact } from "@/domain/types";
import {
  formatDate,
  formatMillions,
  MONTH_NAMES,
  formatPercent,
  formatPerShare,
} from "@/lib/format";

export const METRIC_LABELS: Record<MetricKey, string> = {
  revenue: "Revenue",
  operatingIncome: "Operating income",
  da: "D&A",
  ebitda: "EBITDA (standardized, unadjusted)",
  ebitdaMargin: "EBITDA margin",
  netIncome: "Net income",
  dilutedEps: "Diluted EPS",
};

// Unit shown next to the label in the table.
export const METRIC_UNITS: Record<MetricKey, string> = {
  revenue: "USD m",
  operatingIncome: "USD m",
  da: "USD m",
  ebitda: "USD m",
  ebitdaMargin: "%",
  netIncome: "USD m",
  dilutedEps: "USD",
};

export const STATUS_WORDS = {
  reported: "Reported",
  derived: "Derived",
  nm: "NM",
  missing: "Missing",
  unsupported: "Unsupported",
} as const;

export interface Display {
  text: string;
  kind: "value" | "nm" | "missing" | "unsupported";
  note?: string;
}

function formatByUnit(value: number, unit: string): string {
  if (unit === "USD/shares") return formatPerShare(value);
  if (unit === "ratio") return formatPercent(value);
  if (unit === "USD" || unit === "shares") return formatMillions(value);
  return String(value);
}

export function displayMetric(m: Metric): Display {
  switch (m.status) {
    case "reported":
    case "derived":
      return { text: formatByUnit(m.value, m.unit), kind: "value" };
    case "nm":
      return { text: "NM", kind: "nm", note: m.reason };
    case "missing":
      return { text: "—", kind: "missing", note: m.reason };
    case "unsupported":
      return {
        text: "Unsupported",
        kind: "unsupported",
        note: m.reason.message,
      };
  }
}

// USD and shares in millions (one decimal), EPS in dollars, ratios as filed.
export function formatFactValue(
  value: number,
  unit: ReportedFinancialFact["unit"],
): string {
  return formatByUnit(value, unit);
}

const FACT_UNIT_LABELS: Record<ReportedFinancialFact["unit"], string> = {
  USD: "USD m",
  shares: "m shares",
  "USD/shares": "USD per share",
  pure: "ratio",
};

// The unit a value formatted by formatFactValue is in.
export function factUnitLabel(unit: ReportedFinancialFact["unit"]): string {
  return FACT_UNIT_LABELS[unit];
}

export function formatPeriod(f: ReportedFinancialFact): string {
  return f.period.start
    ? `${formatDate(f.period.start)} – ${formatDate(f.period.end)}`
    : `at ${formatDate(f.period.end)}`;
}

// The LTM bridges (ltmDetail keys) a metric rests on, in display order.
const BRIDGES: Record<MetricKey, MetricKey[]> = {
  revenue: ["revenue"],
  operatingIncome: ["operatingIncome"],
  da: ["da"],
  ebitda: ["operatingIncome", "da"],
  ebitdaMargin: ["operatingIncome", "da", "revenue"],
  netIncome: ["netIncome"],
  dilutedEps: ["dilutedEps"],
};

export function bridgeKeysFor(key: MetricKey): MetricKey[] {
  return BRIDGES[key];
}

// SEC's 'MMDD' fiscal year end → 'December 31'.
export function formatFiscalYearEnd(mmdd: string): string {
  if (!/^\d{4}$/.test(mmdd)) return "—";
  return `${MONTH_NAMES[Number(mmdd.slice(0, 2)) - 1]} ${Number(mmdd.slice(2))}`;
}
