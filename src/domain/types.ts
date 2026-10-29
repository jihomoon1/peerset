// Domain types from blueprint §11. Comps types arrive with the milestone that uses them.

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

// ── Prices (blueprint §9, §11) ──────────────────────────────────────────────

// One end-of-day close. Prices are inputs, never real-time (methodology §12).
export interface QuoteSnapshot {
  symbol: string; // SEC's spelling of the ticker, e.g. 'WSO-B'
  close: number;
  currency: "USD";
  asOfDate: string; // trading date of the close
  source: "user_entered" | "alpha_vantage";
  retrievedAt: string; // ISO timestamp
}

// ── Metrics (blueprint §11, §15) ────────────────────────────────────────────

export type WarningCode =
  | "W_FILING_PARSED"
  | "W_FILING_MISSING"
  | "W_REVENUE_CONCEPTS_DIFFER"
  | "W_DA_FROM_CASH_FLOW"
  | "W_53_WEEKS"
  | "W_EPS_CROSSCHECK"
  | "W_SOURCE_CONFLICT" // same filing, same period, companyfacts and filing disagree
  | "W_FACE_UNAVAILABLE" // §7 rule 7: balance-sheet face unreadable, tag rules used
  | "W_NO_DEBT_LINES" // §7 rule 4: no debt lines, debt is a reported 0
  | "W_DEBT_LINES_NO_AMOUNT" // §7 rule 4: debt lines all blank, a reported 0
  | "W_DEBT_TOTAL_TAG_DIFFERS" // §7 rule 6
  | "W_LEASE_LINE_EXCLUDED" // §7 rule 2: debt-tagged lease-only line left out
  | "W_RESTRICTED_CASH_INCLUDED" // §8
  | "W_SHARES_AFTER_BALANCE_SHEET" // §6: cover date after the balance sheet (info)
  | "W_TICKER_NOT_IN_SEC_LIST" // §6: cover symbol SEC doesn't list for the CIK
  | "W_NOT_IN_EV" // §9: preferred > 0 or NCI > 5% of market cap
  | "W_PRICE_STALE" // §12: price date > 7 days before the analysis date
  | "W_PERIOD_LAG"; // §12: LTM end > 75 days from the peers' median LTM end

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
    | "INPUT_UNSUPPORTED" // a derived metric whose input is Unsupported
    | "UNRECOGNIZED_DEBT_LINE" // §7 rule 3
    | "DEBT_SUBTOTAL_ON_FACE" // §7 rule 3
    | "UNRECOGNIZED_CASH_LINE" // §8
    | "UNRECOGNIZED_EQUITY_LINE" // §9: preferred/NCI-looking line not classified
    | "FACE_VALUE_WITHOUT_FACT" // §7 rule 5
    | "UNLISTED_SHARE_CLASS" // §6: a class with no listed ticker
    | "SHARE_CLASS_MISMATCH" // §6: share counts and symbols don't pair up by class
    | "MULTI_CLASS" // §5: P/E is for single-class companies only
    | "SPLIT_SINCE_ANNUAL"; // §5: stock split since the last 10-K
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
      value: number | null; // the ratio as computed; null when it has none (÷ 0)
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
  value?: number; // the LTM result; present only when every check passed
}

// ── Balance-sheet face (methodology 0.3.0 §7–§9) ────────────────────────────

// One row of the rendered balance sheet (R#.htm). It says only which concept the
// company presents and under what label; its value comes from the XBRL instance.
export interface FaceLine {
  order: number; // row number in the rendered table, headings included
  concept: string; // 'us-gaap:CommercialPaper', or a filer QName 'lii:Foo'
  label: string;
  total: boolean; // label starts with "Total"
  displayed: string; // the cell shown at the balance-sheet date, "" when blank
}

// The rendered balance sheet of the latest periodic filing, or why it could not be
// read (then §7 rule 7: the 0.2.1 tag rules with W_FACE_UNAVAILABLE).
export type BalanceSheetFace =
  | {
      kind: "face";
      url: string; // the R#.htm on sec.gov
      statement: string; // its short name, e.g. 'Consolidated Balance Sheets'
      scale: string | null; // 'Millions' | 'Thousands' as displayed
      lines: FaceLine[];
    }
  | { kind: "unavailable"; reason: string };

// How one face line (or, in the fallback, one tag) was treated, for the drawer.
export interface FaceLineProvenance {
  order: number | null; // row on the rendered balance sheet; null for a fallback tag
  label: string;
  concept: string;
  value: number | null; // full units; null when no consolidated fact at the date
  included: boolean;
  reason: string;
  fact?: ReportedFinancialFact;
}

// ── Peers (blueprint §10.2, §11) ────────────────────────────────────────────

// Why a company in the screened SIC tier is not a selected peer (blueprint §15 style:
// a code plus a plain detail).
export type ExclusionCode =
  | "NO_PERIODIC_FILING" // no 10-K or 10-Q in SEC's recent filings
  | "FOREIGN_FILER" // latest report is a 20-F or 40-F
  | "TRANSITION_PERIOD" // latest report is a 10-KT or 10-QT
  | "FINANCIAL_SIC" // SIC 6000–6799
  | "STALE_FILING" // latest 10-K/10-Q filed more than 200 days before the analysis date
  | "NO_SCREENING_REVENUE" // no usable latest fiscal-year revenue
  | "OUTSIDE_SIZE_RANGE" // screening revenue outside 0.2x–5x the target's
  | "NOT_IN_TOP_N"; // passed every rule but ranked below the number kept

export interface PeerSelectionResult {
  tier: "sic4" | "sic3" | "sic2";
  selected: { cik: string; ticker: string; reason: string }[];
  excluded: {
    cik: string;
    ticker: string;
    code: ExclusionCode;
    detail: string;
  }[];
  indexGeneratedAt: string;
}
