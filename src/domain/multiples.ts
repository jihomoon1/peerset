// The target's multiples (methodology §10): EV/Revenue, EV/EBITDA and P/E, with the
// NM policy in nm.ts. P/E is for single-class companies only and is Unsupported after
// a stock split since the last 10-K (§5).

import { isUsable, mergeWarnings, unusableInputs } from "./metrics/common";
import { nmReason } from "./nm";
import type { Metric, NmReason } from "./types";

export interface MultiplesInput {
  ev: Metric;
  revenue: Metric; // LTM
  ebitda: Metric; // LTM
  price: Metric; // the single class's price, USD/shares
  eps: Metric; // LTM diluted
  // §5 (0.4.0): which EPS the metric is; only changes the formula's wording.
  epsBasis?: "total" | "continuingOperations";
  singleClass: boolean;
  splitSinceLastAnnual: boolean;
}

export interface Multiples {
  evRevenue: Metric;
  evEbitda: Metric;
  pe: Metric;
  // §13C (0.5.0): digital-asset companies only
  mcapToDigitalAssets?: Metric;
  // §13D (0.5.0): banks only
  priceToBook?: Metric;
  priceToTangibleBook?: Metric;
}

function ratio(
  what: string,
  [numName, num]: [string, Metric],
  [denName, den]: [string, Metric],
  rule: { evNumerator: boolean; notPositive: NmReason },
  formula: string,
): Metric {
  const bad = unusableInputs(what, [
    [numName, num],
    [denName, den],
  ]);
  if (bad || !isUsable(num) || !isUsable(den)) return bad!;
  const warnings = mergeWarnings(num.warnings, den.warnings);
  const inputs = [
    { metric: numName, value: num.value },
    { metric: denName, value: den.value },
  ];
  const raw = den.value === 0 ? null : num.value / den.value;
  const nm = nmReason(num.value, den.value, rule);
  if (nm) return { status: "nm", value: raw, reason: nm, inputs, warnings };
  return {
    status: "derived",
    value: raw!,
    unit: "multiple",
    period: den.period,
    formula,
    inputs,
    warnings,
  };
}

const unsupported = (
  code: "MULTI_CLASS" | "SPLIT_SINCE_ANNUAL",
  message: string,
): Metric => ({
  status: "unsupported",
  reason: { code, message },
  warnings: [],
});

// §13C: market cap ÷ digital assets, with the balance-sheet-date caution.
export function computeMcapToDigitalAssets(
  marketCap: Metric,
  digitalAssets: Metric,
  balanceSheetDate: string,
): Metric {
  const m = ratio(
    "Market cap ÷ digital assets",
    ["market cap", marketCap],
    ["digital assets", digitalAssets],
    { evNumerator: false, notPositive: "DIGITAL_ASSETS_NOT_POSITIVE" },
    "market cap ÷ digital assets (balance-sheet fair value)",
  );
  if (m.status === "missing" || m.status === "unsupported") return m;
  return {
    ...m,
    warnings: mergeWarnings(m.warnings, [
      {
        code: "W_DIGITAL_ASSETS_AT_BALANCE_SHEET_DATE",
        message: `digital assets at fair value on ${balanceSheetDate}; coin prices have moved since`,
        severity: "caution",
      },
    ]),
  };
}

// §13D: P/BV and P/TBV, market cap over the balance-sheet equity.
export function computeBookMultiples(
  marketCap: Metric,
  commonEquity: Metric,
  tangibleCommonEquity: Metric,
): { priceToBook: Metric; priceToTangibleBook: Metric } {
  return {
    priceToBook: ratio(
      "P/BV",
      ["market cap", marketCap],
      ["common equity", commonEquity],
      { evNumerator: false, notPositive: "EQUITY_NOT_POSITIVE" },
      "market cap ÷ common equity",
    ),
    priceToTangibleBook: ratio(
      "P/TBV",
      ["market cap", marketCap],
      ["tangible common equity", tangibleCommonEquity],
      { evNumerator: false, notPositive: "TCE_NOT_POSITIVE" },
      "market cap ÷ tangible common equity",
    ),
  };
}

export function computeMultiples(input: MultiplesInput): Multiples {
  const ev: [string, Metric] = ["EV", input.ev];
  return {
    evRevenue: ratio(
      "EV/Revenue",
      ev,
      ["revenue", input.revenue],
      { evNumerator: true, notPositive: "REVENUE_NOT_POSITIVE" },
      "EV ÷ revenue (LTM)",
    ),
    evEbitda: ratio(
      "EV/EBITDA",
      ev,
      ["EBITDA", input.ebitda],
      { evNumerator: true, notPositive: "EBITDA_NOT_POSITIVE" },
      "EV ÷ EBITDA (LTM)",
    ),
    pe: !input.singleClass
      ? unsupported(
          "MULTI_CLASS",
          "P/E is computed for single-class companies only",
        )
      : input.splitSinceLastAnnual
        ? unsupported("SPLIT_SINCE_ANNUAL", "split since last 10-K")
        : ratio(
            "P/E",
            ["price", input.price],
            [
              input.epsBasis === "continuingOperations"
                ? "continuing-operations diluted EPS"
                : "diluted EPS",
              input.eps,
            ],
            { evNumerator: false, notPositive: "EPS_NOT_POSITIVE" },
            input.epsBasis === "continuingOperations"
              ? "price ÷ continuing-operations diluted EPS (LTM)"
              : "price ÷ diluted EPS (LTM)",
          ),
  };
}
