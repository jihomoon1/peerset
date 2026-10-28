// Screening revenue (blueprint §10.1 step 4): the latest fiscal year's revenue from a
// 10-K or 10-K/A, chosen with the app's own revenue code (methodology §3 priority list,
// §1 latest-filed rule, §2 350–378 day check). Used only to size peers; it is labeled
// "screening revenue (latest FY)" and never shown as LTM. Pure.

import { latestFiscalYearEnd } from "./ltm";
import { computeRevenue } from "./metrics/revenue";
import { CONCEPTS } from "./policy";
import type { ReportedFinancialFact } from "./types";

export type ScreeningRevenue =
  | {
      kind: "ok";
      value: number; // USD, full units
      periodEnd: string;
      concept: string;
      accession: string;
    }
  | { kind: "none"; reason: string };

export function screeningRevenue(
  facts: readonly ReportedFinancialFact[],
): ScreeningRevenue {
  const fyEnd = latestFiscalYearEnd(facts, CONCEPTS.revenue);
  if (!fyEnd)
    return {
      kind: "none",
      reason: "no fiscal-year revenue in a 10-K or 10-K/A",
    };

  // After a 10-K the app's LTM is that fiscal year, so this is the same selection.
  const { metric, ltm } = computeRevenue({
    facts,
    ltmEnd: fyEnd,
    latestForm: "10-K",
    freshness: "current",
  });
  if (metric.status !== "reported" || !ltm?.fy)
    return {
      kind: "none",
      reason:
        metric.status === "unsupported"
          ? `fiscal year ending ${fyEnd}: ${metric.reason.message}`
          : `fiscal year ending ${fyEnd}: no usable revenue`,
    };
  return {
    kind: "ok",
    value: metric.value,
    periodEnd: fyEnd,
    concept: ltm.concept,
    accession: ltm.fy.filing.accession,
  };
}
