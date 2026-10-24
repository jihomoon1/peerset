// Freshness reconciliation (blueprint §8.3). submissions decides what the latest
// filing is; companyfacts is trusted only when it contains that filing, otherwise the
// filing's own XBRL instance is parsed. The instance is always parsed for cover-page
// share classes. Facts from both sources are returned as-is: choosing between them is
// the domain's job (factSelection, M1b).

import type {
  CompanyIdentity,
  FilingReference,
  ReportedFinancialFact,
  ReportedTextFact,
} from "@/domain/types";
import {
  InternalError,
  TickerNotFoundError,
  UnsupportedIssuerError,
} from "@/lib/errors";
import type { SecClient, SecJsonResponse, SecResponse } from "./client";
import { trimCompanyFacts, type TrimmedCompanyFacts } from "./companyFacts";
import { locateInstance, parseInstance } from "./filingInstance";
import {
  identityFromSubmissions,
  parseSubmissions,
  reportDatesByAccession,
} from "./submissions";
import {
  companyFactsUrl,
  filingDocumentUrl,
  filingIndexJsonUrl,
  submissionsUrl,
} from "./urls";

// submissions, companyfacts, filing index, instance, plus one spare (M1a scope).
export const REQUEST_BUDGET = 5;

export type FreshnessStatus =
  | "current" // companyfacts contains the latest periodic filing
  | "filing-parsed" // it didn't; the filing's instance was parsed and merged
  | "filing-missing"; // it didn't, and the filing's instance couldn't be found

export interface AdapterWarning {
  code:
    | "W_FILING_PARSED"
    | "W_FILING_MISSING"
    | "W_COVER_PAGE_UNAVAILABLE"
    | "W_DUPLICATE_FACT_CONFLICT"
    | "W_UNPARSEABLE_VALUE";
  message: string;
}

export interface CompanyFactsResult {
  identity: CompanyIdentity;
  facts: ReportedFinancialFact[];
  textFacts: ReportedTextFact[];
  freshness: {
    status: FreshnessStatus;
    latestAccession: string;
    companyfactsNewestAccession: string | null;
  };
  warnings: AdapterWarning[];
  requestsMade: number;
}

export async function getCompanyFacts(
  cik: string,
  { asOf, client }: { asOf: string; client: SecClient },
): Promise<CompanyFactsResult> {
  let requestsMade = 0;
  const count = () => {
    if (++requestsMade > REQUEST_BUDGET)
      throw new InternalError(
        `SEC request budget of ${REQUEST_BUDGET} exceeded for CIK ${cik}`,
      );
  };
  const getJson = (url: string): Promise<SecJsonResponse> => {
    count();
    return client.getJson(url);
  };
  const get = (url: string): Promise<SecResponse> => {
    count();
    return client.get(url);
  };

  // 1. submissions → identity and the latest periodic filing
  const subsRes = await getJson(submissionsUrl(cik));
  if (subsRes.kind === "not-found")
    throw new TickerNotFoundError(cik, "submissions returned 404");
  const submissions = parseSubmissions(subsRes.data);
  const identity = identityFromSubmissions(submissions, { asOf });
  if (!identity.support.supported)
    throw new UnsupportedIssuerError(
      identity.support.reason.message,
      `${identity.support.reason.code} (CIK ${identity.cik})`,
    );
  const latest = identity.latestPeriodic;
  if (!latest)
    throw new InternalError(
      `supported issuer without a periodic filing: ${cik}`,
    );

  // 2. companyfacts. A 404 means SEC has no XBRL facts for the company yet.
  const cfRes = await getJson(companyFactsUrl(identity.cik));
  const trimmed: TrimmedCompanyFacts =
    cfRes.kind === "ok"
      ? trimCompanyFacts(cfRes.data, {
          reportDates: reportDatesByAccession(submissions),
        })
      : {
          facts: [],
          periodicAccessions: new Set(),
          newestPeriodicAccession: null,
        };
  const current = trimmed.periodicAccessions.has(latest.accession);

  // 3–4. The latest filing's instance: needed for the facts when companyfacts is
  // behind, and always for cover-page share classes.
  const filing: FilingReference = {
    accession: latest.accession,
    form: latest.form,
    filedDate: latest.filedDate,
    reportDate: latest.reportDate,
    indexUrl: latest.indexUrl,
  };
  const instance = await fetchInstance(identity.cik, filing, { get, getJson });

  const warnings: AdapterWarning[] = [];
  let status: FreshnessStatus;
  if (current) status = "current";
  else if (instance.kind === "parsed") status = "filing-parsed";
  else status = "filing-missing";

  if (status === "filing-parsed")
    warnings.push({
      code: "W_FILING_PARSED",
      message: `companyfacts was behind; values from ${latest.form} ${latest.accession} parsed from the filing`,
    });
  if (status === "filing-missing")
    warnings.push({
      code: "W_FILING_MISSING",
      message: `companyfacts lacks ${latest.form} ${latest.accession} and its XBRL instance could not be found (${instance.kind === "missing" ? instance.reason : ""})`,
    });
  if (status === "current" && instance.kind === "missing")
    warnings.push({
      code: "W_COVER_PAGE_UNAVAILABLE",
      message: `cover page of ${latest.accession} could not be parsed: ${instance.reason}`,
    });

  // 5. Merge without selecting: every fact keeps its source and accession.
  const parsed = instance.kind === "parsed" ? instance : null;
  if (parsed) warnings.push(...parsed.warnings);

  return {
    identity,
    facts: [...trimmed.facts, ...(parsed?.facts ?? [])],
    textFacts: parsed?.textFacts ?? [],
    freshness: {
      status,
      latestAccession: latest.accession,
      companyfactsNewestAccession: trimmed.newestPeriodicAccession,
    },
    warnings,
    requestsMade,
  };
}

type InstanceResult =
  | ({ kind: "parsed" } & ReturnType<typeof parseInstance>)
  | { kind: "missing"; reason: string };

async function fetchInstance(
  cik: string,
  filing: FilingReference,
  io: {
    get: (url: string) => Promise<SecResponse>;
    getJson: (url: string) => Promise<SecJsonResponse>;
  },
): Promise<InstanceResult> {
  const indexRes = await io.getJson(filingIndexJsonUrl(cik, filing.accession));
  if (indexRes.kind === "not-found")
    return { kind: "missing", reason: "filing index returned 404" };
  const located = locateInstance(indexRes.data);
  if (located.kind === "no-instance")
    return { kind: "missing", reason: located.reason };

  const res = await io.get(
    filingDocumentUrl(cik, filing.accession, located.name),
  );
  if (res.kind === "not-found")
    return { kind: "missing", reason: `${located.name} returned 404` };
  const xml = new TextDecoder().decode(res.body);
  return { kind: "parsed", ...parseInstance(xml, filing) };
}
