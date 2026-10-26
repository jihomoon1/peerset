// Cash and short-term investments (methodology 0.3.0 §8): the sum of the
// balance-sheet face lines classified as cash, cash equivalents or short-term
// investments. Falls back to the 0.2.1 tag rules (§8.F) when the face is unavailable.

import {
  faceUnavailableWarning,
  resolveLines,
  sideOf,
  sumOf,
  type BalanceSheetInput,
  type BalanceSheetItem,
} from "./balanceSheet";
import { selectFact } from "./factSelection";
import {
  CASH_LIKE_LABEL,
  CONCEPTS,
  FACE,
  RESTRICTED_ONLY_LABEL,
} from "./policy";
import type {
  FaceLine,
  FaceLineProvenance,
  MetricUnsupportedReason,
  MetricWarning,
  ReportedFinancialFact,
} from "./types";

const FORMULA =
  "Cash = sum of the balance-sheet cash and short-term investment lines (methodology §8)";
const FALLBACK_FORMULA =
  "Cash = cash and cash equivalents + short-term investments from tags (methodology §8.F, 0.2.1)";

const restrictedWarning = (what: string): MetricWarning => ({
  code: "W_RESTRICTED_CASH_INCLUDED",
  severity: "caution",
  message: `may include restricted cash (${what})`,
});

export function computeCash(input: BalanceSheetInput): BalanceSheetItem {
  if (input.face.kind === "unavailable")
    return cashFromTags(input, faceUnavailableWarning(input.face.reason));

  const { isAssetSide } = sideOf(input.face.lines);
  const candidates: { line: FaceLine; include: boolean; reason: string }[] = [];
  const warnings: MetricWarning[] = [];
  const counted = new Set<string>();
  let unsupported: MetricUnsupportedReason | undefined;

  for (const line of input.face.lines) {
    const { concept, label } = line;
    const cashLike = isAssetSide(line) && CASH_LIKE_LABEL.test(label);
    if (FACE.cash.has(concept) || FACE.cashIncludingRestricted.has(concept)) {
      if (counted.has(concept)) {
        candidates.push({
          line,
          include: false,
          reason: "same concept already counted above",
        });
        continue;
      }
      counted.add(concept);
      const restricted = FACE.cashIncludingRestricted.has(concept);
      if (restricted) warnings.push(restrictedWarning(`'${label}'`));
      candidates.push({
        line,
        include: true,
        reason: restricted
          ? "cash line that may include restricted cash"
          : "cash or short-term investment line",
      });
    } else if (FACE.restrictedCash.has(concept)) {
      candidates.push({
        line,
        include: false,
        reason: "restricted cash presented separately: excluded",
      });
    } else if (FACE.notCash.has(concept) && cashLike) {
      candidates.push({
        line,
        include: false,
        reason: "long-term investment: not cash",
      });
    } else if (cashLike) {
      if (RESTRICTED_ONLY_LABEL.test(label)) {
        candidates.push({
          line,
          include: false,
          reason: "restricted cash presented separately: excluded",
        });
        continue;
      }
      unsupported ??= {
        code: "UNRECOGNIZED_CASH_LINE",
        message: `unrecognized cash line: '${label}' (${concept})`,
      };
      candidates.push({
        line,
        include: false,
        reason: "looks like cash but its concept is not classified",
      });
    }
  }

  const { lines, unsupported: valueProblem } = resolveLines(candidates, input);
  unsupported ??= valueProblem;
  if (unsupported)
    return {
      metric: { status: "unsupported", reason: unsupported, warnings },
      lines,
      method: "face",
    };
  if (counted.size === 0)
    return {
      metric: {
        status: "missing",
        reason: "no cash line on the balance sheet",
        warnings,
      },
      lines,
      method: "face",
    };
  return {
    metric: sumOf(lines, input.date, FORMULA, warnings),
    lines,
    method: "face",
  };
}

// ── §8.F fallback: methodology 0.2.1 tag rules ──────────────────────────────

function cashFromTags(
  input: BalanceSheetInput,
  faceWarning: MetricWarning,
): BalanceSheetItem {
  const at = (concept: string): ReportedFinancialFact | undefined => {
    const sel = selectFact(input.facts, concept, { end: input.date });
    return sel.kind === "found" ? sel.fact : undefined;
  };
  const used: ReportedFinancialFact[] = [];
  const warnings = [faceWarning];

  const cash = at(CONCEPTS.cash[0]);
  if (cash) {
    used.push(cash);
    // "when present and not already included": the tags overlap (AFS debt
    // securities sit inside ShortTermInvestments), so only the first one found.
    const sti = CONCEPTS.shortTermInvestments
      .map(at)
      .find((f) => f !== undefined);
    if (sti) used.push(sti);
  } else {
    for (const c of CONCEPTS.cashRestrictedFallback) {
      const f = at(c);
      if (f) {
        used.push(f);
        warnings.push(restrictedWarning(c));
        break;
      }
    }
  }

  const lines: FaceLineProvenance[] = used.map((f) => ({
    order: null,
    label: f.concept,
    concept: f.concept,
    value: f.value,
    included: true,
    reason: "tag rule (§8.F)",
    fact: f,
  }));
  if (used.length === 0)
    return {
      metric: {
        status: "missing",
        reason: `no cash tag at ${input.date} (methodology §8.F)`,
        warnings,
      },
      lines,
      method: "tags",
    };
  return {
    metric: sumOf(lines, input.date, FALLBACK_FORMULA, warnings),
    lines,
    method: "tags",
  };
}
