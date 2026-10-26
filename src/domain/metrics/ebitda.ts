// EBITDA (standardized, unadjusted) = operating income + D&A (methodology §4). No
// add-backs. Both inputs must cover the same LTM window.

import type { Metric } from "../types";
import { isUsable, mergeWarnings, unusableInputs } from "./common";

export function computeEbitda(operatingIncome: Metric, da: Metric): Metric {
  const bad = unusableInputs("EBITDA", [
    ["operating income", operatingIncome],
    ["D&A", da],
  ]);
  if (bad || !isUsable(operatingIncome) || !isUsable(da)) return bad!;

  const warnings = mergeWarnings(operatingIncome.warnings, da.warnings);
  const [a, b] = [operatingIncome.period, da.period];
  if (a.start !== b.start || a.end !== b.end)
    return {
      status: "unsupported",
      reason: {
        code: "INPUT_UNSUPPORTED",
        message: `operating income (${a.start} to ${a.end}) and D&A (${b.start} to ${b.end}) cover different periods`,
      },
      warnings,
    };
  return {
    status: "derived",
    value: operatingIncome.value + da.value,
    unit: "USD",
    period: a,
    formula: "Operating income + D&A",
    inputs: [
      { metric: "operatingIncome", value: operatingIncome.value },
      { metric: "da", value: da.value },
    ],
    warnings,
  };
}
