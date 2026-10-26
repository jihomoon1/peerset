// EBITDA margin = EBITDA ÷ revenue (methodology §3), shown even when negative. A ratio,
// never NM; revenue at or below zero leaves it Unsupported rather than dividing.

import type { Metric } from "../types";
import { isUsable, mergeWarnings, unusableInputs } from "./common";

export function computeEbitdaMargin(ebitda: Metric, revenue: Metric): Metric {
  const bad = unusableInputs("EBITDA margin", [
    ["EBITDA", ebitda],
    ["revenue", revenue],
  ]);
  if (bad || !isUsable(ebitda) || !isUsable(revenue)) return bad!;

  const warnings = mergeWarnings(ebitda.warnings, revenue.warnings);
  if (revenue.value <= 0)
    return {
      status: "unsupported",
      reason: {
        code: "INPUT_UNSUPPORTED",
        message: "EBITDA margin needs revenue above zero",
      },
      warnings,
    };
  const [a, b] = [ebitda.period, revenue.period];
  if (a.start !== b.start || a.end !== b.end)
    return {
      status: "unsupported",
      reason: {
        code: "INPUT_UNSUPPORTED",
        message: `EBITDA (${a.start} to ${a.end}) and revenue (${b.start} to ${b.end}) cover different periods`,
      },
      warnings,
    };
  return {
    status: "derived",
    value: ebitda.value / revenue.value,
    unit: "ratio",
    period: a,
    formula: "EBITDA ÷ revenue",
    inputs: [
      { metric: "ebitda", value: ebitda.value },
      { metric: "revenue", value: revenue.value },
    ],
    warnings,
  };
}
