// Total debt (methodology 0.3.0 §7): the sum of the balance-sheet face lines whose
// concept is classified as debt. Face lines are disjoint, so nothing is counted
// twice. Falls back to the 0.2.1 tag rules (§7.F) when the face is unavailable.

import {
  faceUnavailableWarning,
  millions,
  resolveLines,
  sideOf,
  sumOf,
  type BalanceSheetInput,
  type BalanceSheetItem,
} from "./balanceSheet";
import { selectFact } from "./factSelection";
import {
  CONCEPTS,
  DEBT_LIKE_LABEL,
  DEBT_TOTAL_TAG_TOLERANCE_USD,
  FACE,
  FINANCE_LEASE_LABEL,
  LEASE_DEBT_WORDS,
  LEASE_LABEL,
} from "./policy";
import type {
  FaceLine,
  FaceLineProvenance,
  Metric,
  MetricWarning,
  ReportedFinancialFact,
} from "./types";

const FORMULA =
  "Total debt = sum of the balance-sheet debt lines (methodology §7)";
const FALLBACK_FORMULA =
  "Total debt = current debt + noncurrent debt from tags (methodology §7.F, 0.2.1)";

export function computeDebt(input: BalanceSheetInput): BalanceSheetItem {
  if (input.face.kind === "unavailable")
    return debtFromTags(input, faceUnavailableWarning(input.face.reason));

  const { isLiabilitySide } = sideOf(input.face.lines);
  const candidates: { line: FaceLine; include: boolean; reason: string }[] = [];
  const warnings: MetricWarning[] = [];
  const counted = new Set<string>();
  let unsupported:
    Extract<Metric, { status: "unsupported" }>["reason"] | undefined;

  for (const line of input.face.lines) {
    const { concept, label } = line;
    if (FACE.operatingLease.has(concept)) {
      candidates.push({
        line,
        include: false,
        reason: "operating lease liability: never debt",
      });
    } else if (FACE.debt.has(concept)) {
      if (counted.has(concept)) {
        candidates.push({
          line,
          include: false,
          reason: "same concept already counted above",
        });
        continue;
      }
      counted.add(concept);
      if (line.total) {
        unsupported ??= {
          code: "DEBT_SUBTOTAL_ON_FACE",
          message: `debt subtotal on the balance sheet: '${label}' (${concept})`,
        };
        candidates.push({ line, include: false, reason: "debt subtotal" });
      } else if (
        !FACE.financeLease.has(concept) &&
        LEASE_LABEL.test(label) &&
        !LEASE_DEBT_WORDS.test(label) &&
        !FINANCE_LEASE_LABEL.test(label)
      ) {
        candidates.push({
          line,
          include: false,
          reason: "lease line that may include operating leases: excluded",
        });
      } else {
        candidates.push({ line, include: true, reason: "debt line" });
      }
    } else if (isLiabilitySide(line) && DEBT_LIKE_LABEL.test(label)) {
      unsupported ??= {
        code: "UNRECOGNIZED_DEBT_LINE",
        message: `unrecognized debt line: '${label}' (${concept})`,
      };
      candidates.push({
        line,
        include: false,
        reason: "looks like debt but its concept is not classified",
      });
    }
  }

  const { lines, unsupported: valueProblem } = resolveLines(candidates, input);
  for (const l of lines)
    if (l.reason.startsWith("lease line"))
      warnings.push({
        code: "W_LEASE_LINE_EXCLUDED",
        severity: "caution",
        message: `excluded '${l.label}' (${l.concept}${l.value !== null ? `, ${millions(l.value)}` : ""}): a lease line that may include operating leases`,
      });

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
        status: "reported",
        value: 0,
        unit: "USD",
        period: { kind: "instant", end: input.date },
        formula: "No debt lines on the balance sheet (methodology §7 rule 4)",
        inputs: [],
        warnings: [
          ...warnings,
          {
            code: "W_NO_DEBT_LINES",
            message: "no debt lines on the balance sheet",
            severity: "info",
          },
        ],
      },
      lines,
      method: "face",
    };

  const metric = sumOf(lines, input.date, FORMULA, warnings);
  if (metric.status === "derived")
    metric.warnings.push(...crossCheck(metric.value, input));
  return { metric, lines, method: "face" };
}

// §7 rule 6 (and §7.F rule 5): a total-debt tag that disagrees by more than 0.1M.
function crossCheck(total: number, input: BalanceSheetInput): MetricWarning[] {
  const out: MetricWarning[] = [];
  for (const concept of CONCEPTS.debtTotalCrossCheck) {
    const sel = selectFact(input.facts, concept, { end: input.date });
    if (sel.kind !== "found") continue;
    if (Math.abs(sel.fact.value - total) > DEBT_TOTAL_TAG_TOLERANCE_USD)
      out.push({
        code: "W_DEBT_TOTAL_TAG_DIFFERS",
        severity: "caution",
        message: `${concept} reports ${millions(sel.fact.value)}; the balance-sheet lines sum to ${millions(total)} (kept)`,
      });
  }
  return out;
}

// ── §7.F fallback: methodology 0.2.1 tag rules ──────────────────────────────

function debtFromTags(
  input: BalanceSheetInput,
  faceWarning: MetricWarning,
): BalanceSheetItem {
  const at = (concept: string): ReportedFinancialFact | undefined => {
    const sel = selectFact(input.facts, concept, { end: input.date });
    return sel.kind === "found" ? sel.fact : undefined;
  };
  const used: ReportedFinancialFact[] = [];
  const lines: FaceLineProvenance[] = [];
  const take = (f: ReportedFinancialFact, reason: string) => {
    used.push(f);
    lines.push({
      order: null,
      label: f.concept,
      concept: f.concept,
      value: f.value,
      included: true,
      reason,
      fact: f,
    });
  };

  // Rule 1: current debt.
  const debtCurrent = at("us-gaap:DebtCurrent");
  let hasCurrent = false;
  if (debtCurrent) {
    take(debtCurrent, "current debt subtotal (§7.F rule 1)");
    hasCurrent = true;
  } else {
    for (const c of [
      "us-gaap:ShortTermBorrowings",
      "us-gaap:CommercialPaper",
    ]) {
      const f = at(c);
      if (f) {
        take(f, "current debt line (§7.F rule 1)");
        hasCurrent = true;
      }
    }
    const cur =
      at("us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent") ??
      at("us-gaap:LongTermDebtCurrent");
    if (cur) {
      take(cur, "current portion of long-term debt (§7.F rule 1)");
      hasCurrent = true;
    }
  }
  // Rule 2: noncurrent debt.
  const noncurrent =
    at("us-gaap:LongTermDebtAndCapitalLeaseObligations") ??
    at("us-gaap:LongTermDebtNoncurrent");
  if (noncurrent) take(noncurrent, "noncurrent debt (§7.F rule 2)");

  if (!hasCurrent || !noncurrent)
    return {
      metric: {
        status: "missing",
        reason: `no ${!hasCurrent ? "current" : "noncurrent"} debt tag at ${input.date} (methodology §7.F)`,
        warnings: [faceWarning],
      },
      lines,
      method: "tags",
    };

  // Rule 4: finance leases, unless the debt tags already include them or the filing
  // says the lease liability sits inside a debt line.
  const capitalLeaseTags = used.some((f) =>
    f.concept.includes("AndCapitalLeaseObligations"),
  );
  const pointsIntoDebt = input.textFacts.some(
    (t) =>
      (CONCEPTS.financeLeaseLineReferences as readonly string[]).includes(
        t.concept,
      ) &&
      t.period.end === input.date &&
      t.value
        .split(/\s+/)
        .some((ref) =>
          FACE.debt.has(
            `us-gaap:${ref.slice(Math.max(ref.lastIndexOf("#"), ref.lastIndexOf(":")) + 1)}`,
          ),
        ),
  );
  if (!capitalLeaseTags && !pointsIntoDebt)
    for (const c of CONCEPTS.financeLease) {
      const f = at(c);
      if (f) take(f, "finance lease liability (§7.F rule 4)");
    }

  const value = used.reduce((sum, f) => sum + f.value, 0);
  return {
    metric: {
      status: "derived",
      value,
      unit: "USD",
      period: { kind: "instant", end: input.date },
      formula: FALLBACK_FORMULA,
      inputs: used,
      warnings: [faceWarning, ...crossCheck(value, input)],
    },
    lines,
    method: "tags",
  };
}
