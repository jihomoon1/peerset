// Composes the SEC adapter's facts into one company's pre-price fundamentals: identity,
// LTM end, the seven operating metrics, their LTM calculations, debt, cash and the EV
// adjustments from the balance-sheet face, cover-page share classes, warnings,
// freshness and methodology version. Plain JSON, so it can be cached and sent to the
// browser as is. Prices are applied later by valuation.ts.

import type { BalanceSheetInput, BalanceSheetItem } from "./balanceSheet";
import { computeShareClasses, type ShareClasses } from "./capitalization";
import { computeCash } from "./cash";
import { computeDebt } from "./debt";
import {
  computeCommonEquity,
  computeRotce,
  computeTangibleCommonEquity,
} from "./bankEquity";
import { millions } from "./balanceSheet";
import { computeDigitalAssets } from "./digitalAssets";
import { computeNci, computePreferred } from "./evAdjustments";
import { classifyIssuer } from "./issuerKind";
import { computeLtm, type LtmInput } from "./ltm";
import { isUsable, ltmMetric } from "./metrics/common";
import { computeDa } from "./metrics/da";
import { computeEbitda } from "./metrics/ebitda";
import { computeEbitdaMargin } from "./metrics/ebitdaMargin";
import { computeEps, type EpsCrossCheck } from "./metrics/eps";
import {
  findDiscontinuedOps,
  type DiscontinuedOps,
} from "./metrics/discontinuedOps";
import { computeNetIncome } from "./metrics/netIncome";
import { computeOperatingIncome } from "./metrics/operatingIncome";
import { computeRevenue } from "./metrics/revenue";
import { CONCEPTS, METHODOLOGY_VERSION } from "./policy";
import type {
  BalanceSheetFace,
  CompanyIdentity,
  FreshnessStatus,
  IssuerKind,
  LTMCalculation,
  Metric,
  ReportedFinancialFact,
  ReportedTextFact,
  UnsupportedReason,
} from "./types";

// The parts of the adapter's CompanyFactsResult the domain reads.
export interface FundamentalsInput {
  identity: CompanyIdentity;
  facts: ReportedFinancialFact[];
  textFacts: ReportedTextFact[];
  balanceSheet: { date: string; face: BalanceSheetFace };
  freshness: {
    status: FreshnessStatus;
    latestAccession: string;
    companyfactsNewestAccession: string | null;
  };
  warnings: { code: string; message: string }[];
}

export const METRIC_KEYS = [
  "revenue",
  "operatingIncome",
  "da",
  "ebitda",
  "ebitdaMargin",
  "netIncome",
  "dilutedEps",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

// §13D: the bank route's equity items, as of the balance-sheet date.
export interface BankFundamentals {
  commonEquity: BalanceSheetItem;
  tangibleCommonEquity: BalanceSheetItem;
  netIncomeToCommon: Metric; // LTM
  rotce: Metric; // LTM net income to common ÷ ending TCE
}

// §13C: the digital-asset route's additions.
export interface DigitalAssetFundamentals {
  digitalAssets: BalanceSheetItem;
  cryptoRemeasurement: Metric; // LTM fair-value gain/loss in operating income, if tagged
}

export interface CompanyFundamentals {
  identity: CompanyIdentity;
  // §13B (0.5.0): null = a SIC 6000–6799 company that is neither a bank nor a
  // digital-asset company; kindUnsupported says why and the loader rejects it.
  kind: IssuerKind | null;
  kindUnsupported?: UnsupportedReason;
  bank?: BankFundamentals;
  digital?: DigitalAssetFundamentals;
  ltmEnd: string;
  metrics: Record<MetricKey, Metric>;
  // Keyed by metric; the D&A fallback stores each line as "da:<concept>".
  ltmDetail: Record<string, LTMCalculation>;
  eps: {
    // §5 (0.4.0): "continuingOperations" when a component period reports
    // discontinued operations; discontinuedOps lists those periods' amounts.
    basis: "total" | "continuingOperations";
    discontinuedOps?: DiscontinuedOps;
    crossCheck: EpsCrossCheck;
    splitSinceLastAnnual: boolean;
    splitEvidence?: string;
  };
  // §3: discontinued operations in net income's own LTM component periods, for the
  // drawer. Usually the same periods EPS uses; found even when EPS has no full LTM.
  netIncomeDiscontinuedOps?: DiscontinuedOps;
  // Methodology §7–§9, as of the balance-sheet date. statement is null when the
  // rendered balance sheet couldn't be read (tag fallback).
  balanceSheet: {
    date: string;
    statement: { url: string; name: string; scale: string | null } | null;
  };
  debt: BalanceSheetItem;
  cash: BalanceSheetItem;
  evAdjustments: { preferred: BalanceSheetItem; nci: BalanceSheetItem };
  shareClasses: ShareClasses; // §6, from the latest filing's cover page
  warnings: { code: string; message: string }[]; // company-level, from the adapter
  freshness: FundamentalsInput["freshness"];
  methodologyVersion: string;
}

export function buildFundamentals(
  input: FundamentalsInput,
): CompanyFundamentals {
  const latest = input.identity.latestPeriodic;
  if (!latest)
    throw new RangeError(
      `no periodic filing for CIK ${input.identity.cik}; the adapter rejects such issuers`,
    );

  const ltm: LtmInput = {
    facts: input.facts,
    ltmEnd: latest.reportDate,
    latestForm: latest.form,
    freshness: input.freshness.status,
  };

  const kindResult = classifyIssuer({
    sic: input.identity.sic,
    facts: input.facts,
    balanceSheetDate: input.balanceSheet.date,
  });
  const kind = kindResult.kind;

  const revenue = computeRevenue(ltm);
  const operatingIncome = computeOperatingIncome(ltm);
  const da = computeDa(ltm);
  const netIncome = computeNetIncome(ltm);
  const eps = computeEps(ltm, netIncome.metric);
  let ebitda = computeEbitda(operatingIncome.metric, da.metric);

  // §13C: a digital-asset company's operating income includes crypto fair-value
  // changes (ASU 2023-08). EBITDA keeps the reported value, with a caution.
  const crypto =
    kind === "digitalAsset"
      ? ltmMetric(computeLtm(ltm, CONCEPTS.cryptoRemeasurement), "USD")
      : null;
  if (crypto) {
    const m = crypto.metric;
    const message = isUsable(m)
      ? `operating income includes an LTM digital-asset fair-value ${m.value < 0 ? "loss" : "gain"} of ${millions(m.value)} (${crypto.ltm?.concept ?? ""}); EBITDA is not adjusted`
      : "operating income may include digital-asset fair-value gains and losses (ASU 2023-08); the filing doesn't tag the LTM amount; EBITDA is not adjusted";
    ebitda = {
      ...ebitda,
      warnings: [
        ...ebitda.warnings,
        {
          code: "W_EBITDA_INCLUDES_CRYPTO_REMEASUREMENT",
          message,
          severity: "caution",
        },
      ],
    };
  }
  // §13D: EBITDA doesn't apply to banks.
  if (kind === "bank")
    ebitda = {
      status: "unsupported",
      reason: {
        code: "NOT_FOR_BANKS",
        message: "banks are valued on equity: EBITDA doesn't apply",
      },
      warnings: [],
    };
  const niDiscOps = netIncome.ltm
    ? findDiscontinuedOps(input.facts, netIncome.ltm)
    : null;

  const bs: BalanceSheetInput = {
    date: input.balanceSheet.date,
    face: input.balanceSheet.face,
    facts: input.facts,
    textFacts: input.textFacts,
  };
  const face = input.balanceSheet.face;

  const ltmDetail: Record<string, LTMCalculation> = {};
  const keep = (key: string, calc?: LTMCalculation) => {
    if (calc) ltmDetail[key] = calc;
  };
  keep("revenue", revenue.ltm);
  keep("operatingIncome", operatingIncome.ltm);
  keep("da", da.ltm);
  for (const part of da.ltmParts) keep(`da:${part.concept}`, part);
  keep("netIncome", netIncome.ltm);
  keep("dilutedEps", eps.ltm);
  if (crypto) keep("cryptoRemeasurement", crypto.ltm);

  const preferred = computePreferred(bs);
  let bank: BankFundamentals | undefined;
  if (kind === "bank") {
    const commonEquity = computeCommonEquity(bs, preferred);
    const tangibleCommonEquity = computeTangibleCommonEquity(bs, commonEquity);
    const toCommon = ltmMetric(
      computeLtm(ltm, CONCEPTS.netIncomeToCommon),
      "USD",
    );
    keep("netIncomeToCommon", toCommon.ltm);
    bank = {
      commonEquity,
      tangibleCommonEquity,
      netIncomeToCommon: toCommon.metric,
      rotce: computeRotce(toCommon.metric, tangibleCommonEquity.metric),
    };
  }

  return {
    identity: input.identity,
    kind,
    ...(kindResult.kind === null ? { kindUnsupported: kindResult.reason } : {}),
    ...(bank ? { bank } : {}),
    ...(crypto
      ? {
          digital: {
            digitalAssets: computeDigitalAssets(bs),
            cryptoRemeasurement: crypto.metric,
          },
        }
      : {}),
    ltmEnd: latest.reportDate,
    metrics: {
      revenue: revenue.metric,
      operatingIncome: operatingIncome.metric,
      da: da.metric,
      ebitda,
      ebitdaMargin: computeEbitdaMargin(ebitda, revenue.metric),
      netIncome: netIncome.metric,
      dilutedEps: eps.metric,
    },
    ltmDetail,
    eps: {
      basis: eps.basis,
      ...(eps.discontinuedOps ? { discontinuedOps: eps.discontinuedOps } : {}),
      crossCheck: eps.crossCheck,
      splitSinceLastAnnual: eps.splitSinceLastAnnual,
      ...(eps.splitEvidence ? { splitEvidence: eps.splitEvidence } : {}),
    },
    ...(niDiscOps?.kind === "found"
      ? { netIncomeDiscontinuedOps: niDiscOps.ops }
      : {}),
    balanceSheet: {
      date: bs.date,
      statement:
        face.kind === "face"
          ? { url: face.url, name: face.statement, scale: face.scale }
          : null,
    },
    debt: computeDebt(bs),
    cash: computeCash(bs),
    evAdjustments: {
      preferred,
      nci: computeNci(bs),
    },
    shareClasses: computeShareClasses({
      facts: input.facts,
      textFacts: input.textFacts,
      latest,
      listings: input.identity.tickers,
      balanceSheetDate: bs.date,
    }),
    warnings: input.warnings.map(({ code, message }) => ({ code, message })),
    freshness: input.freshness,
    methodologyVersion: METHODOLOGY_VERSION,
  };
}
