// Balance-sheet items left out of EV (methodology §9): preferred stock and
// noncontrolling interest, read from the face lines like debt and cash (0.3.0). They
// feed the "material item not in EV" warning once prices exist (M2b).

import {
  faceUnavailableWarning,
  resolveLines,
  sumOf,
  type BalanceSheetInput,
  type BalanceSheetItem,
} from "./balanceSheet";
import { selectFact } from "./factSelection";
import { FACE, NCI_LIKE_LABEL, PREFERRED_LIKE_LABEL } from "./policy";
import type {
  FaceLine,
  FaceLineProvenance,
  MetricUnsupportedReason,
  ReportedFinancialFact,
} from "./types";

interface Kind {
  concepts: ReadonlySet<string>;
  looksLike: RegExp;
  noun: string; // "preferred stock"
}

const PREFERRED: Kind = {
  concepts: FACE.preferred,
  looksLike: PREFERRED_LIKE_LABEL,
  noun: "preferred stock",
};
const NCI: Kind = {
  concepts: FACE.nci,
  looksLike: NCI_LIKE_LABEL,
  noun: "noncontrolling interest",
};

export const computePreferred = (input: BalanceSheetInput) =>
  compute(input, PREFERRED);
export const computeNci = (input: BalanceSheetInput) => compute(input, NCI);

function compute(input: BalanceSheetInput, kind: Kind): BalanceSheetItem {
  if (input.face.kind === "unavailable") return fromTags(input, kind);

  const candidates: { line: FaceLine; include: boolean; reason: string }[] = [];
  const counted = new Set<string>();
  let unsupported: MetricUnsupportedReason | undefined;
  for (const line of input.face.lines) {
    if (kind.concepts.has(line.concept)) {
      const again = counted.has(line.concept);
      counted.add(line.concept);
      candidates.push({
        line,
        include: !again,
        reason: again
          ? "same concept already counted above"
          : `${kind.noun} line`,
      });
    } else if (!line.total && kind.looksLike.test(line.label)) {
      // Totals such as "Total equity including noncontrolling interests" mention
      // the item without being it.
      unsupported ??= {
        code: "UNRECOGNIZED_EQUITY_LINE",
        message: `unrecognized ${kind.noun} line: '${line.label}' (${line.concept})`,
      };
      candidates.push({
        line,
        include: false,
        reason: `looks like ${kind.noun} but its concept is not classified`,
      });
    }
  }

  const { lines, unsupported: valueProblem } = resolveLines(candidates, input);
  unsupported ??= valueProblem;
  if (unsupported)
    return {
      metric: { status: "unsupported", reason: unsupported, warnings: [] },
      lines,
      method: "face",
    };
  if (counted.size === 0)
    return {
      metric: {
        status: "missing",
        reason: `no ${kind.noun} line on the balance sheet`,
        warnings: [],
      },
      lines,
      method: "face",
    };
  return {
    metric: sumOf(
      lines,
      input.date,
      `${kind.noun[0].toUpperCase()}${kind.noun.slice(1)} = balance-sheet line (methodology §9)`,
      [],
    ),
    lines,
    method: "face",
  };
}

function fromTags(input: BalanceSheetInput, kind: Kind): BalanceSheetItem {
  if (input.face.kind !== "unavailable") throw new RangeError("face present");
  const warning = faceUnavailableWarning(input.face.reason);
  const used: ReportedFinancialFact[] = [];
  for (const concept of kind.concepts) {
    const sel = selectFact(input.facts, concept, { end: input.date });
    if (sel.kind === "found") used.push(sel.fact);
  }
  const lines: FaceLineProvenance[] = used.map((f) => ({
    order: null,
    label: f.concept,
    concept: f.concept,
    value: f.value,
    included: true,
    reason: "tag rule (§9)",
    fact: f,
  }));
  if (used.length === 0)
    return {
      metric: {
        status: "missing",
        reason: `no ${kind.noun} tag at ${input.date}`,
        warnings: [warning],
      },
      lines,
      method: "tags",
    };
  return {
    metric: sumOf(
      lines,
      input.date,
      `${kind.noun} from tags (methodology §9)`,
      [warning],
    ),
    lines,
    method: "tags",
  };
}
