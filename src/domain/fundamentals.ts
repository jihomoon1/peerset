// Composes the SEC adapter's facts into one company's pre-price fundamentals: identity,
// LTM end, the seven operating metrics, their LTM calculations, debt, cash and the EV
// adjustments from the balance-sheet face, cover-page share classes, warnings,
// freshness and methodology version. Plain JSON, so it can be cached and sent to the
// browser as is. Prices are applied later by valuation.ts.

import type { BalanceSheetInput, BalanceSheetItem } from "./balanceSheet";
import { computeShareClasses, type ShareClasses } from "./capitalization";
import { computeCash } from "./cash";
import { computeDebt } from "./debt";
import { computeNci, computePreferred } from "./evAdjustments";
import type { LtmInput } from "./ltm";
import { computeDa } from "./metrics/da";
import { computeEbitda } from "./metrics/ebitda";
import { computeEbitdaMargin } from "./metrics/ebitdaMargin";
import { computeEps, type EpsCrossCheck } from "./metrics/eps";
import { computeNetIncome } from "./metrics/netIncome";
import { computeOperatingIncome } from "./metrics/operatingIncome";
import { computeRevenue } from "./metrics/revenue";
import { METHODOLOGY_VERSION } from "./policy";
import type {
  BalanceSheetFace,
  CompanyIdentity,
  FreshnessStatus,
  LTMCalculation,
  Metric,
  ReportedFinancialFact,
  ReportedTextFact,
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

export interface CompanyFundamentals {
  identity: CompanyIdentity;
  ltmEnd: string;
  metrics: Record<MetricKey, Metric>;
  // Keyed by metric; the D&A fallback stores each line as "da:<concept>".
  ltmDetail: Record<string, LTMCalculation>;
  eps: {
    crossCheck: EpsCrossCheck;
    splitSinceLastAnnual: boolean;
    splitEvidence?: string;
  };
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

  const revenue = computeRevenue(ltm);
  const operatingIncome = computeOperatingIncome(ltm);
  const da = computeDa(ltm);
  const netIncome = computeNetIncome(ltm);
  const eps = computeEps(ltm, netIncome.metric);
  const ebitda = computeEbitda(operatingIncome.metric, da.metric);

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

  return {
    identity: input.identity,
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
      crossCheck: eps.crossCheck,
      splitSinceLastAnnual: eps.splitSinceLastAnnual,
      ...(eps.splitEvidence ? { splitEvidence: eps.splitEvidence } : {}),
    },
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
      preferred: computePreferred(bs),
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
