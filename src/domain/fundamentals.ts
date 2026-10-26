// Composes the SEC adapter's facts into one company's pre-price fundamentals: identity,
// LTM end, the seven operating metrics, their LTM calculations, warnings, freshness and
// methodology version. Plain JSON, so it can be cached and sent to the browser as is.

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
  CompanyIdentity,
  FreshnessStatus,
  LTMCalculation,
  Metric,
  ReportedFinancialFact,
} from "./types";

// The parts of the adapter's CompanyFactsResult the domain reads.
export interface FundamentalsInput {
  identity: CompanyIdentity;
  facts: ReportedFinancialFact[];
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
    warnings: input.warnings.map(({ code, message }) => ({ code, message })),
    freshness: input.freshness,
    methodologyVersion: METHODOLOGY_VERSION,
  };
}
