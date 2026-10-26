// Shared plumbing for the balance-sheet items (methodology 0.3.0 §7–§9): reading a
// face line's value from the facts, and turning classified lines into a Metric with
// line-level provenance. Pure: tests feed it a face, facts and a date.

import { selectFact } from "./factSelection";
import type {
  BalanceSheetFace,
  FaceLine,
  FaceLineProvenance,
  Metric,
  MetricUnsupportedReason,
  MetricWarning,
  ReportedFinancialFact,
  ReportedTextFact,
} from "./types";

export type { BalanceSheetFace };

export interface BalanceSheetInput {
  date: string; // the balance-sheet date: the latest periodic filing's period end
  face: BalanceSheetFace;
  facts: readonly ReportedFinancialFact[];
  textFacts: readonly ReportedTextFact[]; // fallback §7.F rule 4 line references
}

export interface BalanceSheetItem {
  metric: Metric;
  lines: FaceLineProvenance[];
  method: "face" | "tags"; // "tags" = the 0.2.1 fallback (§7 rule 7)
}

export const ASSETS_TOTAL = "us-gaap:Assets";

// Rows up to and including the total-assets row are the assets side. Without that
// row, every line counts as both sides, so the label checks see everything.
export function sideOf(lines: readonly FaceLine[]) {
  const assets = lines.find((l) => l.concept === ASSETS_TOTAL)?.order;
  return {
    isAssetSide: (l: FaceLine) => assets === undefined || l.order <= assets,
    isLiabilitySide: (l: FaceLine) => assets === undefined || l.order > assets,
  };
}

const isBlank = (displayed: string) =>
  /^[$\s]*[—–-]?\s*$/.test(displayed.replace(/ /g, " "));

export type LineValue =
  | { kind: "fact"; fact: ReportedFinancialFact }
  | { kind: "blank" } // no fact and the face shows nothing: contributes nothing
  | { kind: "unsupported"; reason: MetricUnsupportedReason };

// §7 rule 1: the consolidated fact for the line's concept at the date, chosen by the
// latest-filed rule (§1) — in practice the latest filing's own instance.
export function lineValue(line: FaceLine, input: BalanceSheetInput): LineValue {
  const sel = selectFact(input.facts, line.concept, { end: input.date });
  if (sel.kind === "found") return { kind: "fact", fact: sel.fact };
  if (sel.kind === "conflict")
    return {
      kind: "unsupported",
      reason: {
        code: "SOURCE_CONFLICT",
        message: `'${line.label}' (${line.concept}): facts filed the same day disagree`,
      },
    };
  if (isBlank(line.displayed)) return { kind: "blank" };
  return {
    kind: "unsupported",
    reason: {
      code: "FACE_VALUE_WITHOUT_FACT",
      message: `'${line.label}' (${line.concept}) shows ${line.displayed} but has no consolidated fact at ${input.date}`,
    },
  };
}

export function provenance(
  line: FaceLine,
  included: boolean,
  reason: string,
  fact?: ReportedFinancialFact,
): FaceLineProvenance {
  return {
    order: line.order,
    label: line.label,
    concept: line.concept,
    value: fact?.value ?? null,
    included,
    reason,
    ...(fact ? { fact } : {}),
  };
}

// "11,427.0M": warnings quote amounts the way the filings show them.
export function millions(v: number): string {
  return `${(v / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}M`;
}

export function faceUnavailableWarning(reason: string): MetricWarning {
  return {
    code: "W_FACE_UNAVAILABLE",
    message: `balance-sheet face unavailable (${reason}); tag rules used`,
    severity: "caution",
  };
}

// Sums the included lines that have a value. Callers decide Unsupported/Missing first.
export function sumOf(
  lines: readonly FaceLineProvenance[],
  date: string,
  formula: string,
  warnings: MetricWarning[],
): Metric {
  const used = lines.filter((l) => l.included && l.fact);
  return {
    status: "derived",
    value: used.reduce((sum, l) => sum + l.fact!.value, 0),
    unit: "USD",
    period: { kind: "instant", end: date },
    formula,
    inputs: used.map((l) => l.fact!),
    warnings,
  };
}

// Reads every candidate line: included lines get their value (or are blank), and the
// first unsupported value stops the item. Lines already marked excluded keep their
// value for display when one exists.
export function resolveLines(
  candidates: { line: FaceLine; include: boolean; reason: string }[],
  input: BalanceSheetInput,
): { lines: FaceLineProvenance[]; unsupported?: MetricUnsupportedReason } {
  const lines: FaceLineProvenance[] = [];
  let unsupported: MetricUnsupportedReason | undefined;
  for (const { line, include, reason } of candidates) {
    const v = lineValue(line, input);
    if (v.kind === "fact") {
      lines.push(provenance(line, include, reason, v.fact));
    } else if (v.kind === "blank") {
      lines.push(
        provenance(
          line,
          false,
          include ? "no value at the balance-sheet date (shown as —)" : reason,
        ),
      );
    } else {
      lines.push(provenance(line, false, v.reason.message));
      if (include) unsupported ??= v.reason;
    }
  }
  return { lines, unsupported };
}
