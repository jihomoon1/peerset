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
import { formatPercent, formatPerShare } from "@/lib/format";
import { isUsable, ltmMetric, type LtmMetricResult } from "./common";
import {
  describeDiscontinuedOps,
  findDiscontinuedOps,
  type DiscontinuedOps,
} from "./discontinuedOps";

export type EpsCrossCheck =
  | {
      status: "checked";
      netIncome: number; // the numerator: LTM net income, or continuing-ops income
      numeratorConcept: string;
      dilutedShares: number;
      impliedEps: number;
      gap: number; // |EPS − implied| ÷ |EPS|
    }
  | { status: "skipped"; reason: string };

export interface EpsResult extends LtmMetricResult {
  // §5 (0.4.0): total diluted EPS, or continuing operations when a component
  // period reports discontinued operations.
  basis: "total" | "continuingOperations";
  discontinuedOps?: DiscontinuedOps;
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
  numeratorConcept: string,
): EpsCrossCheck {
  if (!isUsable(netIncome))
    return {
      status: "skipped",
      reason:
        netIncome.status === "unsupported"
          ? `LTM ${numeratorConcept} unavailable: ${netIncome.reason.message}`
          : `LTM ${numeratorConcept} is ${netIncome.status}`,
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
    numeratorConcept,
    dilutedShares,
    impliedEps,
    gap: Math.abs(eps - impliedEps) / Math.abs(eps),
  };
}

function detectSplit(
  input: LtmInput,
  ltm: LTMCalculation,
  opts: { restatement: boolean },
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
  if (!restated || !opts.restatement) return { split: false };
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
        evidence: `prior-year YTD EPS first filed as ${original.value} (${original.filing.accession}), restated to ${restated.value} (${restated.filing.accession}): ratio ${formatPerShare(ratio)}`,
      }
    : { split: false };
}

export function computeEps(input: LtmInput, netIncome: Metric): EpsResult {
  const total = computeLtm(input, CONCEPTS.dilutedEps);
  const cont = computeLtm(input, CONCEPTS.continuingOpsEps);
  // §5: the component periods are total diluted EPS's; when total EPS has no LTM,
  // continuing-operations EPS's, so discontinued operations are still found.
  const periods =
    total.kind === "ok"
      ? total.calc
      : cont.kind === "ok"
        ? cont.calc
        : undefined;
  const found = periods
    ? findDiscontinuedOps(input.facts, periods)
    : ({ kind: "none" } as const);

  if (found.kind === "none" && total.kind !== "ok")
    return {
      ...ltmMetric(total, "USD/shares"),
      basis: "total",
      crossCheck: { status: "skipped", reason: "LTM EPS unavailable" },
      splitSinceLastAnnual: false,
    };
  // Split detection always compares total EPS (§5): a reclassification restates
  // continuing-ops EPS, not a split. Without a total-EPS LTM only the split-ratio
  // fact can be checked.
  const split = detectSplit(
    input,
    total.kind === "ok" ? total.calc : periods!,
    {
      restatement: total.kind === "ok",
    },
  );
  const splitFields = {
    splitSinceLastAnnual: split.split,
    ...(split.evidence ? { splitEvidence: split.evidence } : {}),
  };

  if (found.kind === "conflict") {
    const c = found.conflict;
    return {
      metric: {
        status: "unsupported",
        reason: {
          code: "SOURCE_CONFLICT",
          message: `facts filed the same day disagree on ${c.concept} for the ${c.role === "fy" ? "fiscal year" : c.role === "ytdCurrent" ? "current YTD" : "prior-year YTD"} (${c.facts.map((f) => f.value).join(" vs ")}), so whether discontinued operations are reported can't be decided`,
        },
        warnings: [],
      },
      basis: "total",
      crossCheck: {
        status: "skipped",
        reason: "discontinued operations undecided",
      },
      ...splitFields,
    };
  }
  const discOps = found.kind === "found" ? found.ops : null;
  if (!discOps && total.kind !== "ok") throw new Error("unreachable");
  let r = total as Extract<typeof total, { kind: "ok" }>;
  let numerator = netIncome;
  let numeratorConcept: string = CONCEPTS.netIncome[0];
  const notes: MetricWarning[] = [];
  if (discOps) {
    if (cont.kind !== "ok")
      return {
        metric: {
          status: "unsupported",
          reason: {
            code:
              cont.kind === "unsupported" &&
              cont.reason.code !== "NO_CONCEPT_WITH_ALL_COMPONENTS"
                ? cont.reason.code
                : "NO_CONCEPT_WITH_ALL_COMPONENTS",
            message: `continuing-operations EPS not reported (${cont.reason.message}); discontinued operations in ${describeDiscontinuedOps(discOps)}`,
          },
          warnings: cont.warnings,
        },
        ltm: cont.calc,
        basis: "continuingOperations",
        discontinuedOps: discOps,
        crossCheck: {
          status: "skipped",
          reason: "continuing-operations EPS not reported",
        },
        ...splitFields,
      };
    r = cont;
    numeratorConcept = CONCEPTS.continuingOpsIncome[0];
    numerator = ltmMetric(
      computeLtm(input, CONCEPTS.continuingOpsIncome),
      "USD",
    ).metric;
    notes.push({
      code: "W_EPS_CONTINUING_OPS",
      message: `diluted EPS is from continuing operations (${CONCEPTS.continuingOpsEps[0]}) because discontinued operations are reported: ${describeDiscontinuedOps(discOps)}`,
      severity: "info",
    });
  }

  const check = crossCheck(input, r.calc, r.value, numerator, numeratorConcept);
  const warnings: MetricWarning[] = [...notes];
  if (check.status === "checked" && check.gap > EPS_CROSSCHECK_TOLERANCE)
    warnings.push({
      code: "W_EPS_CROSSCHECK",
      message: `LTM diluted EPS ${formatPerShare(r.value)} differs by ${formatPercent(check.gap)} from LTM ${discOps ? "continuing-operations income" : "net income"} ÷ FY diluted shares (${formatPerShare(check.impliedEps)})`,
      severity: "caution",
    });
  return {
    ...ltmMetric(r, "USD/shares", warnings),
    basis: discOps ? "continuingOperations" : "total",
    ...(discOps ? { discontinuedOps: discOps } : {}),
    crossCheck: check,
    ...splitFields,
  };
}
