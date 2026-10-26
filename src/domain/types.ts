// Domain types from blueprint §11. Share classes, EV and comps types arrive with the
// milestones that use them.

export type Unit = "USD" | "USD/shares" | "shares" | "ratio" | "multiple";

export type PeriodicForm = "10-K" | "10-K/A" | "10-Q" | "10-Q/A";

export interface FilingReference {
  accession: string; // '0001069202-26-000087'
  form: PeriodicForm;
  filedDate: string; // ISO date
  reportDate: string; // period end
  indexUrl: string; // filing index on sec.gov
}

export interface ReportingPeriod {
  kind: "duration" | "instant";
  start?: string; // required when kind = 'duration'
  end: string;
  label?: string; // 'FY2025', '6M FY2026'
}

export type FactSource = "companyfacts" | "filing";

export interface ReportedFinancialFact {
  concept: string; // 'us-gaap:Revenues'
  value: number; // full units, never rounded
  unit: "USD" | "USD/shares" | "shares" | "pure"; // pure: split ratio only (§1.2)
  period: ReportingPeriod;
  decimals?: number; // precision as filed; absent when INF or not reported
  dimensions: Record<string, string>; // {} = consolidated
  filing: FilingReference;
  source: FactSource;
}

// Non-numeric whitelisted facts from a filing instance: cover-page text such as
// dei:TradingSymbol, and the finance-lease ExtensibleList line references (§7 rule 4).
// companyfacts has no equivalent, so these only ever come from the filing.
export interface ReportedTextFact {
  concept: string;
  value: string;
  period: ReportingPeriod;
  dimensions: Record<string, string>;
  filing: FilingReference;
  source: "filing";
}

export type UnsupportedReason =
  | { code: "FOREIGN_FILER"; message: string } // 20-F / 40-F
  | { code: "FINANCIAL_SIC"; message: string } // SIC 6000–6799
  | { code: "STALE_FILER"; message: string } // latest periodic > 200 days old
  | { code: "TRANSITION_PERIOD"; message: string } // 10-KT / 10-QT
  | { code: "NO_PERIODIC_FILING"; message: string };

export interface Listing {
  ticker: string;
  exchange: string;
}

export interface CompanyIdentity {
  cik: string; // 10-digit, zero-padded
  ticker: string; // primary listing (first in SEC's list)
  name: string;
  exchange: string;
  tickers: Listing[]; // every listed class, e.g. WSO and WSO-B
  sic: string;
  sicDescription: string;
  fiscalYearEnd: string; // 'MMDD' from submissions; shifts for 52/53-week filers
  stateOfIncorporation: string;
  latestPeriodic: (FilingReference & { primaryDocument: string }) | null;
  support:
    { supported: true } | { supported: false; reason: UnsupportedReason };
}

// Freshness of the latest periodic filing's facts (blueprint §8.3), set by the SEC
// adapter and read by the domain.
export type FreshnessStatus =
  | "current" // companyfacts contains the latest periodic filing
  | "filing-parsed" // it didn't; the filing's instance was parsed and merged
  | "filing-missing"; // it didn't, and the filing's instance couldn't be found

// ── Metrics (blueprint §11, §15) ────────────────────────────────────────────

export type WarningCode =
  | "W_FILING_PARSED"
  | "W_FILING_MISSING"
  | "W_REVENUE_CONCEPTS_DIFFER"
  | "W_DA_FROM_CASH_FLOW"
  | "W_53_WEEKS"
  | "W_EPS_CROSSCHECK"
  | "W_SOURCE_CONFLICT"; // same filing, same period, companyfacts and filing disagree

export interface MetricWarning {
  code: WarningCode;
  message: string;
  severity: "info" | "caution";
}

// Why a value is NM (methodology §10). Multiples arrive in M2; margins never are NM.
export type NmReason =
  | "REVENUE_NOT_POSITIVE"
  | "EBITDA_NOT_POSITIVE"
  | "EPS_NOT_POSITIVE"
  | "EV_NOT_POSITIVE"
  | "ABOVE_CAP";

// Metric-level reasons. Blueprint §11 reuses the issuer-level UnsupportedReason here,
// but those codes (FOREIGN_FILER, ...) can't say "cannot reconstruct LTM", so metrics
// get their own list.
export interface MetricUnsupportedReason {
  code:
    | "LTM_CHECK_FAILED" // a §2 check failed
    | "NO_CONCEPT_WITH_ALL_COMPONENTS" // §3: no concept has FY, YTD and prior YTD
    | "SOURCE_CONFLICT" // companyfacts and the filing disagree on the same fact
    | "FILING_MISSING" // freshness filing-missing: never compute on an older quarter
    | "INPUT_UNSUPPORTED"; // a derived metric whose input is Unsupported
  message: string;
}

// A fact used directly, or another metric's value used as an input.
export type Provenance =
  ReportedFinancialFact | { metric: string; value: number };

// Every financial value carries a status. Only 'reported' and 'derived' are usable
// numbers; reading .value requires narrowing on status first.
export type Metric =
  | {
      status: "reported" | "derived";
      value: number;
      unit: Unit;
      period: ReportingPeriod;
      formula: string;
      inputs: Provenance[];
      warnings: MetricWarning[];
    }
  | {
      status: "nm";
      value: number;
      reason: NmReason;
      inputs: Provenance[];
      warnings: MetricWarning[];
    }
  | { status: "missing"; reason: string; warnings: MetricWarning[] }
  | {
      status: "unsupported";
      reason: MetricUnsupportedReason;
      warnings: MetricWarning[];
    };

export type LTMCheckName =
  | "fiscal-year-duration"
  | "ytd-starts-after-fiscal-year"
  | "prior-ytd-duration"
  | "prior-ytd-start-offset"
  | "same-concept";

export interface LTMCheck {
  name: LTMCheckName;
  passed: boolean;
  detail?: string;
}

// How one LTM value was built (methodology §2), kept for the provenance drawer.
export interface LTMCalculation {
  method: "annual" | "fy_plus_ytd_minus_prior_ytd";
  concept: string;
  ltmEnd: string;
  fy: ReportedFinancialFact;
  ytdCurrent?: ReportedFinancialFact; // present for the 10-Q method
  ytdPrior?: ReportedFinancialFact;
  checks: LTMCheck[];
}
