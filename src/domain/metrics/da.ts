// D&A (methodology §3, §4): the priority list, then Depreciation +
// AmortizationOfIntangibleAssets over the same periods. Always from the cash-flow
// statement, so always warned.

import { computeLtm, ltmForConcept, type LtmInput } from "../ltm";
import { CONCEPTS } from "../policy";
import type { LTMCalculation, MetricWarning } from "../types";
import {
  componentsOf,
  ltmMetric,
  mergeWarnings,
  type LtmMetricResult,
} from "./common";

const FROM_CASH_FLOW: MetricWarning = {
  code: "W_DA_FROM_CASH_FLOW",
  message:
    "D&A is taken from the cash-flow statement and may include items outside operating expenses",
  severity: "info",
};

export interface DaResult extends LtmMetricResult {
  ltmParts: LTMCalculation[]; // the two lines when the last fallback is used
}

const periodsOf = (c: LTMCalculation) =>
  componentsOf(c)
    .map((f) => `${f.period.start}/${f.period.end}`)
    .join(",");

export function computeDa(input: LtmInput): DaResult {
  const main = computeLtm(input, CONCEPTS.da);
  if (
    main.kind === "ok" ||
    main.reason.code !== "NO_CONCEPT_WITH_ALL_COMPONENTS"
  )
    return { ...ltmMetric(main, "USD", [FROM_CASH_FLOW]), ltmParts: [] };

  const [dep, amort] = CONCEPTS.daComponents.map((c) =>
    ltmForConcept(input, c),
  );
  if (
    dep.kind === "ok" &&
    amort.kind === "ok" &&
    periodsOf(dep.calc) === periodsOf(amort.calc)
  )
    return {
      metric: {
        status: "derived",
        value: dep.value + amort.value,
        unit: "USD",
        period: dep.period,
        formula: `D&A = ${dep.calc.concept} + ${amort.calc.concept}, each ${dep.calc.method === "annual" ? "the fiscal year" : "FY + current YTD − prior-year YTD"}`,
        inputs: [...componentsOf(dep.calc), ...componentsOf(amort.calc)],
        warnings: mergeWarnings(dep.warnings, amort.warnings, [FROM_CASH_FLOW]),
      },
      ltmParts: [dep.calc, amort.calc],
    };

  const why = [dep, amort]
    .map((r, i) =>
      r.kind === "ok"
        ? null
        : `${CONCEPTS.daComponents[i]}: ${r.kind === "no-components" ? `missing ${r.missing.join(", ")}` : r.reason.message}`,
    )
    .filter(Boolean);
  return {
    metric: {
      status: "unsupported",
      reason: {
        code: main.reason.code,
        message: `${main.reason.message}; fallback ${CONCEPTS.daComponents.join(" + ")} ${why.length ? `unavailable (${why.join("; ")})` : "covers different periods"}`,
      },
      warnings: mergeWarnings(
        ...[dep, amort].map((r) =>
          r.kind === "no-components" ? [] : r.warnings,
        ),
        [FROM_CASH_FLOW],
      ),
    },
    ltmParts: [],
  };
}
