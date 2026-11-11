// Bank equity (methodology §13D, 0.5.0), read from the balance-sheet face like debt
// and cash. Common equity = StockholdersEquity − preferred stock inside equity;
// tangible common equity (TCE) = common equity − goodwill and intangible lines.
// Servicing assets stay in TCE. ROTCE = LTM net income to common ÷ ending TCE.

import {
  lineValue,
  millions,
  provenance,
  sideOf,
  type BalanceSheetInput,
  type BalanceSheetItem,
} from "./balanceSheet";
import { isUsable, mergeWarnings, unusableInputs } from "./metrics/common";
import {
  FACE,
  INTANGIBLE_LIKE_LABEL,
  SERVICING_LABEL,
  TEMPORARY_EQUITY_BY_LABEL,
} from "./policy";
import type {
  FaceLineProvenance,
  Metric,
  MetricWarning,
  Provenance,
} from "./types";

const unsupported = (
  code:
    | "NO_PARENT_EQUITY_LINE"
    | "UNRECOGNIZED_INTANGIBLE_LINE"
    | "INPUT_UNSUPPORTED",
  message: string,
  warnings: MetricWarning[] = [],
): Metric => ({ status: "unsupported", reason: { code, message }, warnings });

export function computeCommonEquity(
  input: BalanceSheetInput,
  preferred: BalanceSheetItem,
): BalanceSheetItem {
  if (input.face.kind === "unavailable")
    return {
      metric: {
        status: "missing",
        reason: "balance-sheet face unavailable",
        warnings: [],
      },
      lines: [],
      method: "face",
    };
  const equityLine = input.face.lines.find((l) =>
    FACE.parentEquity.has(l.concept),
  );
  if (!equityLine)
    return {
      metric: unsupported(
        "NO_PARENT_EQUITY_LINE",
        "no stockholders' equity line (us-gaap:StockholdersEquity) on the balance sheet",
      ),
      lines: [],
      method: "face",
    };
  const v = lineValue(equityLine, input);
  if (v.kind !== "fact")
    return {
      metric:
        v.kind === "unsupported"
          ? { status: "unsupported", reason: v.reason, warnings: [] }
          : unsupported(
              "NO_PARENT_EQUITY_LINE",
              `'${equityLine.label}' has no value at ${input.date}`,
            ),
      lines: [provenance(equityLine, false, "no value")],
      method: "face",
    };
  const equity = v.fact;
  const lines: FaceLineProvenance[] = [
    provenance(equityLine, true, "stockholders' equity (parent)", equity),
  ];

  const p = preferred.metric;
  if (p.status === "unsupported" || p.status === "nm")
    return {
      metric: unsupported(
        "INPUT_UNSUPPORTED",
        `common equity needs preferred stock, which is unsupported: ${p.status === "unsupported" ? p.reason.message : "NM"}`,
      ),
      lines,
      method: "face",
    };
  const warnings: MetricWarning[] = [];
  // Temporary-equity preferred sits outside StockholdersEquity: not subtracted.
  const inEquity = preferred.lines.filter(
    (l) =>
      l.included &&
      l.fact &&
      FACE.preferred.has(l.concept) &&
      !TEMPORARY_EQUITY_BY_LABEL.has(l.concept),
  );
  if (p.status === "missing")
    warnings.push({
      code: "W_NO_PREFERRED_LINE",
      message:
        "no preferred stock line on the balance sheet: nothing subtracted",
      severity: "info",
    });
  for (const l of inEquity)
    lines.push({ ...l, reason: "preferred stock inside equity: subtracted" });
  const preferredTotal = inEquity.reduce((s, l) => s + l.fact!.value, 0);
  const inputs: Provenance[] = [equity, ...inEquity.map((l) => l.fact!)];
  return {
    metric: {
      status: "derived",
      value: equity.value - preferredTotal,
      unit: "USD",
      period: { kind: "instant", end: input.date },
      formula:
        "Common equity = stockholders' equity − preferred stock (methodology §13D)",
      inputs,
      warnings,
    },
    lines,
    method: "face",
  };
}

export function computeTangibleCommonEquity(
  input: BalanceSheetInput,
  commonEquity: BalanceSheetItem,
): BalanceSheetItem {
  const ce = commonEquity.metric;
  const bad = unusableInputs("Tangible common equity", [["common equity", ce]]);
  if (bad || !isUsable(ce) || input.face.kind === "unavailable")
    return {
      metric: bad ?? {
        status: "missing",
        reason: "balance-sheet face unavailable",
        warnings: [],
      },
      lines: [],
      method: "face",
    };

  const { isAssetSide } = sideOf(input.face.lines);
  const lines: FaceLineProvenance[] = [];
  const warnings: MetricWarning[] = [];
  const counted = new Set<string>();
  let deducted = 0;
  const inputs: Provenance[] = [{ metric: "commonEquity", value: ce.value }];
  for (const line of input.face.lines) {
    if (!isAssetSide(line)) continue;
    if (FACE.intangibles.has(line.concept)) {
      if (counted.has(line.concept)) {
        lines.push(
          provenance(line, false, "same concept already deducted above"),
        );
        continue;
      }
      counted.add(line.concept);
      const v = lineValue(line, input);
      if (v.kind === "unsupported")
        return {
          metric: { status: "unsupported", reason: v.reason, warnings },
          lines: [...lines, provenance(line, false, v.reason.message)],
          method: "face",
        };
      if (v.kind === "blank") {
        lines.push(
          provenance(line, false, "no value at the balance-sheet date"),
        );
        continue;
      }
      lines.push(
        provenance(line, true, "goodwill or intangible line: deducted", v.fact),
      );
      deducted += v.fact.value;
      inputs.push(v.fact);
      if (SERVICING_LABEL.test(line.label))
        warnings.push({
          code: "W_INTANGIBLES_INCLUDE_SERVICING",
          message: `'${line.label}' (${millions(v.fact.value)}) also holds servicing rights and is deducted whole: TCE may be understated`,
          severity: "caution",
        });
    } else if (!line.total && INTANGIBLE_LIKE_LABEL.test(line.label)) {
      return {
        metric: unsupported(
          "UNRECOGNIZED_INTANGIBLE_LINE",
          `unrecognized intangible line: '${line.label}' (${line.concept})`,
          warnings,
        ),
        lines: [
          ...lines,
          provenance(
            line,
            false,
            "looks like goodwill or intangibles but its concept is not classified",
          ),
        ],
        method: "face",
      };
    }
  }
  return {
    metric: {
      status: "derived",
      value: ce.value - deducted,
      unit: "USD",
      period: { kind: "instant", end: input.date },
      formula:
        "TCE = common equity − goodwill and intangible assets (methodology §13D)",
      inputs,
      warnings: mergeWarnings(ce.warnings, warnings),
    },
    lines,
    method: "face",
  };
}

// §13D: ROTCE (LTM) = LTM net income available to common ÷ ending TCE. A percentage:
// shown when negative, NM only when TCE ≤ 0, never capped.
export function computeRotce(netIncomeToCommon: Metric, tce: Metric): Metric {
  const bad = unusableInputs("ROTCE", [
    ["net income to common", netIncomeToCommon],
    ["tangible common equity", tce],
  ]);
  if (bad || !isUsable(netIncomeToCommon) || !isUsable(tce)) return bad!;
  const warnings = mergeWarnings(netIncomeToCommon.warnings, tce.warnings);
  const inputs = [
    { metric: "netIncomeToCommon", value: netIncomeToCommon.value },
    { metric: "tangibleCommonEquity", value: tce.value },
  ];
  if (tce.value <= 0)
    return {
      status: "nm",
      value: tce.value === 0 ? null : netIncomeToCommon.value / tce.value,
      reason: "TCE_NOT_POSITIVE",
      inputs,
      warnings,
    };
  return {
    status: "derived",
    value: netIncomeToCommon.value / tce.value,
    unit: "ratio",
    period: netIncomeToCommon.period,
    formula: "LTM net income to common ÷ ending tangible common equity",
    inputs,
    warnings,
  };
}
