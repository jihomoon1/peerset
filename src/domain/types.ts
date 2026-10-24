// Domain types from blueprint §11 that the SEC adapter needs. The rest (Metric,
// LTMCalculation, ...) arrive with M1b when something uses them.

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
  unit: "USD" | "USD/shares" | "shares";
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
  support: { supported: true } | { supported: false; reason: UnsupportedReason };
}
