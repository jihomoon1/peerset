// Digital assets (methodology §13C, 0.5.0): the balance-sheet face lines tagged with
// the three us-gaap crypto fair-value concepts (ASU 2023-08), at the balance-sheet date.
// Company-concept lines that look like digital assets are listed with a caution but
// not counted: the tags don't say whether they are owned coins or customer collateral.
// Digital assets are never cash and never enter EV.

import {
  faceUnavailableWarning,
  millions,
  resolveLines,
  sideOf,
  sumOf,
  type BalanceSheetInput,
  type BalanceSheetItem,
} from "./balanceSheet";
import { DIGITAL_ASSET_LIKE_LABEL, FACE } from "./policy";
import type { FaceLine, MetricWarning } from "./types";

const FORMULA =
  "Digital assets = sum of the balance-sheet crypto fair-value lines (methodology §13C)";

export function computeDigitalAssets(
  input: BalanceSheetInput,
): BalanceSheetItem {
  if (input.face.kind === "unavailable")
    return {
      metric: {
        status: "missing",
        reason: "balance-sheet face unavailable",
        warnings: [faceUnavailableWarning(input.face.reason)],
      },
      lines: [],
      method: "face",
    };

  const { isAssetSide } = sideOf(input.face.lines);
  const candidates: { line: FaceLine; include: boolean; reason: string }[] = [];
  const counted = new Set<string>();
  for (const line of input.face.lines) {
    if (FACE.digitalAssets.has(line.concept)) {
      const again = counted.has(line.concept);
      counted.add(line.concept);
      candidates.push({
        line,
        include: !again,
        reason: again
          ? "same concept already counted above"
          : "crypto fair-value line",
      });
    } else if (
      isAssetSide(line) &&
      !line.total &&
      DIGITAL_ASSET_LIKE_LABEL.test(line.label)
    ) {
      candidates.push({
        line,
        include: false,
        reason:
          "company concept: may be coins lent out or customer collateral, not counted",
      });
    }
  }

  const { lines, unsupported } = resolveLines(candidates, input);
  const warnings: MetricWarning[] = lines
    .filter(
      (l) =>
        !FACE.digitalAssets.has(l.concept) && l.value !== null && l.value !== 0,
    )
    .map((l) => ({
      code: "W_DIGITAL_ASSET_LINE_NOT_COUNTED" as const,
      message: `not counted in digital assets: '${l.label}' ${millions(l.value!)} (${l.concept})`,
      severity: "caution" as const,
    }));
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
        reason: "no crypto fair-value line on the balance sheet",
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
