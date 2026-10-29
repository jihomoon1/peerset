// CompanyIdentity from data.sec.gov submissions: who the company is, its latest
// periodic filing, and whether PeerSet supports it (blueprint §3). The caller injects
// asOf; this module never reads the clock.

import { daysBetween } from "@/domain/dates";
import {
  EXCLUDED_SIC_RANGE,
  PERIODIC_FORMS,
  STALE_FILER_DAYS,
} from "@/domain/policy";
import type {
  CompanyIdentity,
  PeriodicForm,
  UnsupportedReason,
} from "@/domain/types";
import { parseOrThrow, SubmissionsSchema, type Submissions } from "./schemas";
import { filingIndexPageUrl, padCik } from "./urls";

export const FOREIGN_FORMS: ReadonlySet<string> = new Set([
  "20-F",
  "20-F/A",
  "40-F",
  "40-F/A",
]);
export const TRANSITION_FORMS: ReadonlySet<string> = new Set([
  "10-KT",
  "10-KT/A",
  "10-QT",
  "10-QT/A",
]);

export interface LatestReport {
  accession: string;
  form: string;
  filedDate: string;
  reportDate: string;
  primaryDocument: string;
}
type Row = LatestReport;

export function buildIdentity(
  raw: unknown,
  { asOf }: { asOf: string },
): CompanyIdentity {
  return identityFromSubmissions(parseSubmissions(raw), { asOf });
}

export function parseSubmissions(raw: unknown): Submissions {
  return parseOrThrow(SubmissionsSchema, raw, "submissions");
}

// accession → report date for every filing in the recent list (companyfacts lacks it).
export function reportDatesByAccession(s: Submissions): Map<string, string> {
  const out = new Map<string, string>();
  const { accessionNumber, reportDate } = s.filings.recent;
  accessionNumber.forEach((accession, i) => {
    if (reportDate[i]) out.set(accession, reportDate[i]);
  });
  return out;
}

// The newest report that could be "the latest periodic", including the forms that
// make a company unsupported (20-F/40-F, transition periods). Rows without a report
// date can't be ordered and are skipped. Newest by report date, then filing date.
export function latestReport(s: Submissions): LatestReport | undefined {
  const recent = s.filings.recent;
  const candidates: Row[] = [];
  for (let i = 0; i < recent.accessionNumber.length; i++) {
    const form = recent.form[i];
    const isCandidate =
      PERIODIC_FORMS.has(form) ||
      FOREIGN_FORMS.has(form) ||
      TRANSITION_FORMS.has(form);
    if (!isCandidate || !recent.reportDate[i]) continue;
    candidates.push({
      accession: recent.accessionNumber[i],
      form,
      filedDate: recent.filingDate[i],
      reportDate: recent.reportDate[i],
      primaryDocument: recent.primaryDocument[i],
    });
  }
  // ISO strings sort as dates.
  candidates.sort(
    (a, b) =>
      b.reportDate.localeCompare(a.reportDate) ||
      b.filedDate.localeCompare(a.filedDate),
  );
  return candidates[0];
}

export function identityFromSubmissions(
  s: Submissions,
  { asOf }: { asOf: string },
): CompanyIdentity {
  const cik = padCik(s.cik);
  const latest = latestReport(s);

  const latestPeriodic =
    latest && PERIODIC_FORMS.has(latest.form)
      ? {
          accession: latest.accession,
          form: latest.form as PeriodicForm,
          filedDate: latest.filedDate,
          reportDate: latest.reportDate,
          primaryDocument: latest.primaryDocument,
          indexUrl: filingIndexPageUrl(cik, latest.accession),
        }
      : null;

  const tickers = s.tickers.map((ticker, i) => ({
    ticker,
    exchange: s.exchanges[i] ?? "",
  }));

  const reason = unsupportedReason(latest, s.sic, asOf);
  return {
    cik,
    name: s.name,
    ticker: tickers[0]?.ticker ?? "",
    exchange: tickers[0]?.exchange ?? "",
    tickers,
    sic: s.sic,
    sicDescription: s.sicDescription ?? "",
    fiscalYearEnd: s.fiscalYearEnd ?? "",
    stateOfIncorporation: s.stateOfIncorporation ?? "",
    latestPeriodic,
    support: reason ? { supported: false, reason } : { supported: true },
  };
}

function unsupportedReason(
  latest: Row | undefined,
  sic: string,
  asOf: string,
): UnsupportedReason | null {
  if (!latest)
    return {
      code: "NO_PERIODIC_FILING",
      message: "No 10-K or 10-Q filing found in SEC's recent filings list",
    };
  if (FOREIGN_FORMS.has(latest.form))
    return {
      code: "FOREIGN_FILER",
      message: `Files ${latest.form} annual reports; only 10-K and 10-Q filers are supported`,
    };
  if (TRANSITION_FORMS.has(latest.form))
    return {
      code: "TRANSITION_PERIOD",
      message: `Latest report is a ${latest.form} transition-period filing, which can't be compared`,
    };
  const sicNumber = Number(sic);
  if (
    sicNumber >= EXCLUDED_SIC_RANGE.min &&
    sicNumber <= EXCLUDED_SIC_RANGE.max
  )
    return {
      code: "FINANCIAL_SIC",
      message: `Financial company (SIC ${sic}); trading comps by EV/EBITDA don't apply`,
    };
  const age = daysBetween(latest.filedDate, asOf);
  if (age > STALE_FILER_DAYS)
    return {
      code: "STALE_FILER",
      message: `Latest 10-K or 10-Q was filed ${latest.filedDate}, more than ${STALE_FILER_DAYS} days ago`,
    };
  return null;
}
