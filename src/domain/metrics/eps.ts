// Diluted EPS (methodology §5): LTM = FY + current YTD − prior-year YTD from reported
// EPS facts, never summed quarters. Cross-checked against LTM net income ÷ FY
// weighted-average diluted shares (a warning, not a suppression). Split detection
// sets a flag that M2's P/E reads.

import { selectFact } from "../factSelection";
import { computeLtm, type LtmInput } from "../ltm";
import {
  CONCEPTS,
  EPS_CROSSCHECK_TOLERANCE,
  PERIODIC_FORMS,
  SPLIT_LIKE_RATIO,
} from "../policy";
import type { LTMCalculation, Metric, MetricWarning } from "../types";
import { isUsable, ltmMetric, type LtmMetricResult } from "./common";

export type EpsCrossCheck =
  | {
      status: "checked";
      netIncome: number;
      dilutedShares: number;
      impliedEps: number;
      gap: number; // |EPS − implied| ÷ |EPS|
    }
  | { status: "skipped"; reason: string };

export interface EpsResult extends LtmMetricResult {
  crossCheck: EpsCrossCheck;
  splitSinceLastAnnual: boolean;
  splitEvidence?: string;
}

// §5, §14: max(r, 1/r) within 2% of 1.5 or a whole number 2–50.
export function isSplitLike(ratio: number): boolean {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return false;
  const big = Math.max(ratio, 1 / ratio);
  return SPLIT_LIKE_RATIO.targets.some(
    (t) => Math.abs(big - t) / t <= SPLIT_LIKE_RATIO.tolerance,
  );
}

function crossCheck(
  input: LtmInput,
  ltm: LTMCalculation,
  eps: number,
  netIncome: Metric,
): EpsCrossCheck {
  if (!isUsable(netIncome))
    return {
      status: "skipped",
      reason: `LTM net income is ${netIncome.status}`,
    };
  const fy = ltm.fy.period;
  const shares = selectFact(input.facts, CONCEPTS.epsCrossCheck[0], {
    start: fy.start,
    end: fy.end,
  });
  if (shares.kind !== "found")
    return {
      status: "skipped",
      reason: `no single FY ${fy.start} to ${fy.end} ${CONCEPTS.epsCrossCheck[0]} fact`,
    };
  const dilutedShares = shares.fact.value;
  if (dilutedShares <= 0 || eps === 0)
    return { status: "skipped", reason: "diluted shares or EPS is zero" };
  const impliedEps = netIncome.value / dilutedShares;
  return {
    status: "checked",
    netIncome: netIncome.value,
    dilutedShares,
    impliedEps,
    gap: Math.abs(eps - impliedEps) / Math.abs(eps),
  };
}

function detectSplit(
  input: LtmInput,
  ltm: LTMCalculation,
): { split: boolean; evidence?: string } {
  const fyEnd = ltm.fy.period.end;
  const ratioFact = input.facts.find(
    (f) =>
      CONCEPTS.stockSplit.includes(
        f.concept as (typeof CONCEPTS.stockSplit)[number],
      ) &&
      Object.keys(f.dimensions).length === 0 &&
      PERIODIC_FORMS.has(f.filing.form) &&
      f.period.end > fyEnd &&
      f.value !== 1,
  );
  if (ratioFact)
    return {
      split: true,
      evidence: `split ratio ${ratioFact.value} reported for the period ending ${ratioFact.period.end} (${ratioFact.filing.form} ${ratioFact.filing.accession})`,
    };

  const restated = ltm.ytdPrior;
  if (!restated) return { split: false };
  // The originally filed value: the earliest-filed consolidated fact for that period.
  const original = input.facts
    .filter(
      (f) =>
        f.concept === restated.concept &&
        Object.keys(f.dimensions).length === 0 &&
        PERIODIC_FORMS.has(f.filing.form) &&
        f.period.kind === "duration" &&
        f.period.start === restated.period.start &&
        f.period.end === restated.period.end,
    )
    .sort((a, b) => a.filing.filedDate.localeCompare(b.filing.filedDate))[0];
  if (
    !original ||
    original.filing.accession === restated.filing.accession ||
    restated.value === 0
  )
    return { split: false };
  const ratio = original.value / restated.value;
  return isSplitLike(ratio)
    ? {
        split: true,
        evidence: `prior-year YTD EPS first filed as ${original.value} (${original.filing.accession}), restated to ${restated.value} (${restated.filing.accession}): ratio ${ratio.toFixed(2)}`,
      }
    : { split: false };
}

export function computeEps(input: LtmInput, netIncome: Metric): EpsResult {
  const r = computeLtm(input, CONCEPTS.dilutedEps);
  if (r.kind !== "ok")
    return {
      ...ltmMetric(r, "USD/shares"),
      crossCheck: { status: "skipped", reason: "LTM EPS unavailable" },
      splitSinceLastAnnual: false,
    };

  const check = crossCheck(input, r.calc, r.value, netIncome);
  const warnings: MetricWarning[] = [];
  if (check.status === "checked" && check.gap > EPS_CROSSCHECK_TOLERANCE)
    warnings.push({
      code: "W_EPS_CROSSCHECK",
      message: `LTM diluted EPS ${r.value.toFixed(2)} differs by ${(check.gap * 100).toFixed(1)}% from LTM net income ÷ FY diluted shares (${check.impliedEps.toFixed(2)})`,
      severity: "caution",
    });
  const split = detectSplit(input, r.calc);
  return {
    ...ltmMetric(r, "USD/shares", warnings),
    crossCheck: check,
    splitSinceLastAnnual: split.split,
    ...(split.evidence ? { splitEvidence: split.evidence } : {}),
  };
}
