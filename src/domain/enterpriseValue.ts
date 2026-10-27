// Market cap and the EV bridge (methodology §6, §9, §12).
//   Market cap = Σ over classes of (price of class × shares of class)
//   EV = market cap + total debt − cash and short-term investments
// Preferred stock and noncontrolling interest stay out of EV, with W_NOT_IN_EV when
// material. Pure: quotes and the analysis date are inputs.

import { formatPercent } from "@/lib/format";
import { millions, type BalanceSheetItem } from "./balanceSheet";
import {
  normalizeSymbol,
  type ShareClass,
  type ShareClasses,
} from "./capitalization";
import { daysBetween } from "./dates";
import { isUsable, mergeWarnings, unusableInputs } from "./metrics/common";
import { NCI_MATERIALITY, PRICE_STALE_DAYS } from "./policy";
import type {
  FaceLineProvenance,
  Metric,
  MetricWarning,
  Provenance,
  QuoteSnapshot,
} from "./types";

// Blueprint §11.
export interface ShareClassCapitalization extends ShareClass {
  quote?: QuoteSnapshot;
  equityValue: Metric; // price × shares for this class
}

export interface MarketCapResult {
  classes: ShareClassCapitalization[];
  marketCap: Metric;
  priceDate?: string; // the earliest price date among the classes' quotes
}

export function computeMarketCap(
  shareClasses: ShareClasses,
  quotes: readonly QuoteSnapshot[],
  analysisDate: string,
): MarketCapResult {
  const quoteFor = (ticker: string) =>
    quotes.find((q) => normalizeSymbol(q.symbol) === normalizeSymbol(ticker));

  const classes: ShareClassCapitalization[] = shareClasses.classes.map((c) => {
    const quote = c.ticker ? quoteFor(c.ticker) : undefined;
    const equityValue: Metric = !c.ticker
      ? {
          status: "unsupported",
          reason: {
            code: "UNLISTED_SHARE_CLASS",
            message: `unlisted share class: ${c.classMember}`,
          },
          warnings: [],
        }
      : !quote
        ? {
            status: "missing",
            reason: `price needed for ${c.ticker}`,
            warnings: [],
          }
        : {
            status: "derived",
            value: quote.close * c.shares,
            unit: "USD",
            period: { kind: "instant", end: quote.asOfDate },
            formula: `price × shares (${c.ticker})`,
            inputs: [
              { metric: `price ${c.ticker}`, value: quote.close },
              c.fact,
            ],
            warnings: [],
          };
    return { ...c, ...(quote ? { quote } : {}), equityValue };
  });

  const priced = classes.flatMap((c) => (c.quote ? [c.quote] : []));
  const priceDate = priced.length
    ? priced.map((q) => q.asOfDate).reduce((a, b) => (a < b ? a : b))
    : undefined;
  const withDate = priceDate ? { priceDate } : {};

  if (shareClasses.blocker) {
    const b = shareClasses.blocker;
    const marketCap: Metric =
      b.status === "missing"
        ? { status: "missing", reason: b.reason, warnings: [] }
        : { status: "unsupported", reason: b.reason, warnings: [] };
    return { classes, marketCap, ...withDate };
  }
  if (classes.length === 0)
    return {
      classes,
      marketCap: {
        status: "missing",
        reason: "no share classes to price",
        warnings: [],
      },
      ...withDate,
    };
  const unpriced = classes.filter((c) => !c.quote).map((c) => c.ticker);
  if (unpriced.length > 0)
    return {
      classes,
      marketCap: {
        status: "missing",
        reason: `price needed for ${unpriced.join(", ")}`,
        warnings: [],
      },
      ...withDate,
    };

  const warnings: MetricWarning[] = [];
  for (const q of priced) {
    const age = daysBetween(q.asOfDate, analysisDate);
    if (age > PRICE_STALE_DAYS)
      warnings.push({
        code: "W_PRICE_STALE",
        message: `price for ${q.symbol} is ${age} days old (${q.asOfDate})`,
        severity: "caution",
      });
  }
  // Every class is listed and priced here; still, never add a class as zero.
  const values = classes.map((c) => c.equityValue);
  const unusable = values.find((m) => !isUsable(m));
  if (unusable)
    return { classes, marketCap: { ...unusable, warnings: [] }, ...withDate };
  const usable = values.filter(isUsable);
  const inputs: Provenance[] = usable.flatMap((m) => m.inputs);
  return {
    classes,
    marketCap: {
      status: "derived",
      value: usable.reduce((sum, m) => sum + m.value, 0),
      unit: "USD",
      period: { kind: "instant", end: priceDate! },
      formula: "Σ price × shares over share classes",
      inputs,
      warnings,
    },
    ...withDate,
  };
}

// ── EV bridge (blueprint §11) ───────────────────────────────────────────────

export interface BridgeLine {
  order: number | null;
  concept: string;
  label: string;
  value: number | null;
  included: boolean;
  why: string;
}

export type NotInEvItem =
  | { item: "preferred" | "nci"; status: "reported" | "derived"; value: number }
  | { item: "preferred" | "nci"; status: "missing" | "unsupported" | "nm" };

export interface EnterpriseValueBridge {
  marketCap: Metric;
  debtLines: BridgeLine[];
  totalDebt: Metric;
  cashLines: BridgeLine[];
  cashAndInvestments: Metric;
  notInEv: NotInEvItem[];
  enterpriseValue: Metric;
  dates: { price?: string; balanceSheet: string; sharesAsOf?: string };
}

export interface EnterpriseValueInput {
  marketCap: Metric;
  debt: BalanceSheetItem;
  cash: BalanceSheetItem;
  preferred: BalanceSheetItem;
  nci: BalanceSheetItem;
  balanceSheetDate: string;
  priceDate?: string;
  sharesAsOf?: string;
}

const bridgeLine = (l: FaceLineProvenance): BridgeLine => ({
  order: l.order,
  concept: l.concept,
  label: l.label,
  value: l.value,
  included: l.included,
  why: l.reason,
});

function notInEvItem(item: "preferred" | "nci", m: Metric): NotInEvItem {
  return isUsable(m)
    ? { item, status: m.status, value: m.value }
    : { item, status: m.status };
}

function notInEvWarnings(input: EnterpriseValueInput): MetricWarning[] {
  const out: MetricWarning[] = [];
  const { preferred, nci } = input;
  if (isUsable(preferred.metric) && preferred.metric.value > 0)
    out.push({
      code: "W_NOT_IN_EV",
      message: `material item not in EV: preferred stock ${millions(preferred.metric.value)}`,
      severity: "caution",
    });
  if (
    isUsable(nci.metric) &&
    isUsable(input.marketCap) &&
    input.marketCap.value > 0 &&
    nci.metric.value / input.marketCap.value > NCI_MATERIALITY
  )
    out.push({
      code: "W_NOT_IN_EV",
      message: `material item not in EV: noncontrolling interest ${millions(nci.metric.value)} is ${formatPercent(nci.metric.value / input.marketCap.value)} of market cap (above ${NCI_MATERIALITY * 100}%)`,
      severity: "caution",
    });
  return out;
}

export function computeEnterpriseValue(
  input: EnterpriseValueInput,
): EnterpriseValueBridge {
  const { marketCap } = input;
  const totalDebt = input.debt.metric;
  const cash = input.cash.metric;
  const common = {
    marketCap,
    debtLines: input.debt.lines.map(bridgeLine),
    totalDebt,
    cashLines: input.cash.lines.map(bridgeLine),
    cashAndInvestments: cash,
    notInEv: [
      notInEvItem("preferred", input.preferred.metric),
      notInEvItem("nci", input.nci.metric),
    ],
    dates: {
      ...(input.priceDate ? { price: input.priceDate } : {}),
      balanceSheet: input.balanceSheetDate,
      ...(input.sharesAsOf ? { sharesAsOf: input.sharesAsOf } : {}),
    },
  };

  // A missing market cap already says what it needs ("price needed for LII").
  if (marketCap.status === "missing")
    return {
      ...common,
      enterpriseValue: {
        status: "missing",
        reason: marketCap.reason,
        warnings: [],
      },
    };
  const bad = unusableInputs("EV", [
    ["market cap", marketCap],
    ["total debt", totalDebt],
    ["cash and short-term investments", cash],
  ]);
  // EV carries only its own warnings; each input's stay on that input's row.
  if (bad || !isUsable(marketCap) || !isUsable(totalDebt) || !isUsable(cash))
    return { ...common, enterpriseValue: { ...bad!, warnings: [] } };

  return {
    ...common,
    enterpriseValue: {
      status: "derived",
      value: marketCap.value + totalDebt.value - cash.value,
      unit: "USD",
      period: marketCap.period,
      formula: "market cap + total debt − cash and short-term investments",
      inputs: [
        { metric: "marketCap", value: marketCap.value },
        { metric: "totalDebt", value: totalDebt.value },
        { metric: "cash", value: cash.value },
      ],
      // A stale price makes EV stale too; other input warnings stay on their rows.
      warnings: mergeWarnings(
        marketCap.warnings.filter((w) => w.code === "W_PRICE_STALE"),
        notInEvWarnings(input),
      ),
    },
  };
}
