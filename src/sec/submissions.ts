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
import { parseOrThrow, SubmissionsSchema } from "./schemas";
import { filingIndexPageUrl, padCik } from "./urls";

const FOREIGN_FORMS = new Set(["20-F", "20-F/A", "40-F", "40-F/A"]);
const TRANSITION_FORMS = new Set(["10-KT", "10-KT/A", "10-QT", "10-QT/A"]);

interface Row {
  accession: string;
  form: string;
  filedDate: string;
  reportDate: string;
  primaryDocument: string;
}

export function buildIdentity(
  raw: unknown,
  { asOf }: { asOf: string },
): CompanyIdentity {
  const s = parseOrThrow(SubmissionsSchema, raw, "submissions");
  const cik = padCik(s.cik);
  const recent = s.filings.recent;

  // Every report that could be "the latest periodic", including the forms that make a
  // company unsupported. Rows without a report date can't be ordered and are skipped.
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
  // Newest by report date, then filing date (ISO strings sort as dates).
  candidates.sort(
    (a, b) =>
      b.reportDate.localeCompare(a.reportDate) ||
      b.filedDate.localeCompare(a.filedDate),
  );
  const latest = candidates[0];

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
