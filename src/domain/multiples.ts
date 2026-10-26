// The target's multiples (methodology §10): EV/Revenue, EV/EBITDA and P/E, with the
// NM policy in nm.ts. P/E is for single-class companies only and is Unsupported after
// a stock split since the last 10-K (§5).

import { isUsable, mergeWarnings, unusableInputs } from "./metrics/common";
import { nmReason } from "./nm";
import type { Metric, NmReason } from "./types";

export interface MultiplesInput {
  ev: Metric;
  revenue: Metric; // LTM
  ebitda: Metric; // LTM
  price: Metric; // the single class's price, USD/shares
  eps: Metric; // LTM diluted
  singleClass: boolean;
  splitSinceLastAnnual: boolean;
}

export interface Multiples {
  evRevenue: Metric;
  evEbitda: Metric;
  pe: Metric;
}

function ratio(
  what: string,
  [numName, num]: [string, Metric],
  [denName, den]: [string, Metric],
  rule: { evNumerator: boolean; notPositive: NmReason },
  formula: string,
): Metric {
  const bad = unusableInputs(what, [
    [numName, num],
    [denName, den],
  ]);
  if (bad || !isUsable(num) || !isUsable(den)) return bad!;
  const warnings = mergeWarnings(num.warnings, den.warnings);
  const inputs = [
    { metric: numName, value: num.value },
    { metric: denName, value: den.value },
  ];
  const raw = den.value === 0 ? null : num.value / den.value;
  const nm = nmReason(num.value, den.value, rule);
  if (nm) return { status: "nm", value: raw, reason: nm, inputs, warnings };
  return {
    status: "derived",
    value: raw!,
    unit: "multiple",
    period: den.period,
    formula,
    inputs,
    warnings,
  };
}

const unsupported = (
  code: "MULTI_CLASS" | "SPLIT_SINCE_ANNUAL",
  message: string,
): Metric => ({
  status: "unsupported",
  reason: { code, message },
  warnings: [],
});

export function computeMultiples(input: MultiplesInput): Multiples {
  const ev: [string, Metric] = ["EV", input.ev];
  return {
    evRevenue: ratio(
      "EV/Revenue",
      ev,
      ["revenue", input.revenue],
      { evNumerator: true, notPositive: "REVENUE_NOT_POSITIVE" },
      "EV ÷ revenue (LTM)",
    ),
    evEbitda: ratio(
      "EV/EBITDA",
      ev,
      ["EBITDA", input.ebitda],
      { evNumerator: true, notPositive: "EBITDA_NOT_POSITIVE" },
      "EV ÷ EBITDA (LTM)",
    ),
    pe: !input.singleClass
      ? unsupported(
          "MULTI_CLASS",
          "P/E is computed for single-class companies only",
        )
      : input.splitSinceLastAnnual
        ? unsupported("SPLIT_SINCE_ANNUAL", "split since last 10-K")
        : ratio(
            "P/E",
            ["price", input.price],
            ["diluted EPS", input.eps],
            { evNumerator: false, notPositive: "EPS_NOT_POSITIVE" },
            "price ÷ diluted EPS (LTM)",
          ),
  };
}
