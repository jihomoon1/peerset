// Freshness reconciliation (blueprint §8.3). submissions decides what the latest
// filing is; companyfacts is trusted only when it contains that filing, otherwise the
// filing's own XBRL instance is parsed. The instance is always parsed for cover-page
// share classes and for the balance-sheet face lines (methodology 0.3.0 §7). Facts from both sources are returned as-is: choosing between them is
// the domain's job (factSelection, M1b).

import {
  SEC_REQUESTS_PER_COMPANY,
  STATEMENT_CACHE_SECONDS,
} from "@/domain/policy";
import type {
  BalanceSheetFace,
  CompanyIdentity,
  FilingReference,
  FreshnessStatus,
  ReportedFinancialFact,
  ReportedTextFact,
} from "@/domain/types";
import {
  InternalError,
  TickerNotFoundError,
  UnsupportedIssuerError,
} from "@/lib/errors";
import type {
  FetchCacheOptions,
  SecClient,
  SecJsonResponse,
  SecResponse,
} from "./client";
import { trimCompanyFacts, type TrimmedCompanyFacts } from "./companyFacts";
import { locateInstance, parseInstance } from "./filingInstance";
import { FilingIndexSchema, parseOrThrow } from "./schemas";
import { locateBalanceSheet, parseBalanceSheet } from "./statements";
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

// Logical requests per company: submissions, companyfacts, filing index,
// FilingSummary.xml, the balance-sheet R file, instance, plus one spare (decision
// 0006). Client retries on 5xx/timeout are not counted here.
export const REQUEST_BUDGET = SEC_REQUESTS_PER_COMPANY;

export type { FreshnessStatus };

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
  // The latest filing's rendered balance sheet, dated at its report date.
  balanceSheet: { date: string; face: BalanceSheetFace };
  requestsMade: number;
}

export async function getCompanyFacts(
  cik: string,
  {
    asOf,
    client,
    submissionsRevalidate,
  }: {
    asOf: string;
    client: SecClient;
    // Seconds to keep submissions in the fetch cache (blueprint §14: 6 h). Off by default.
    submissionsRevalidate?: number;
  },
): Promise<CompanyFactsResult> {
  let requestsMade = 0;
  const count = () => {
    if (++requestsMade > REQUEST_BUDGET)
      throw new InternalError(
        `SEC request budget of ${REQUEST_BUDGET} exceeded for CIK ${cik}`,
      );
  };
  const getJson = (
    url: string,
    cache?: { revalidate?: number },
  ): Promise<SecJsonResponse> => {
    count();
    return client.getJson(url, cache);
  };
  const get = (
    url: string,
    cache?: FetchCacheOptions,
  ): Promise<SecResponse> => {
    count();
    return client.get(url, cache);
  };

  // 1. submissions → identity and the latest periodic filing
  const subsRes = await getJson(submissionsUrl(cik), {
    revalidate: submissionsRevalidate,
  });
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

  // 3–6. The latest filing: index, rendered balance sheet, then the instance —
  // needed for the facts when companyfacts is behind, and always for cover-page
  // share classes and the face-line values.
  const filing: FilingReference = {
    accession: latest.accession,
    form: latest.form,
    filedDate: latest.filedDate,
    reportDate: latest.reportDate,
    indexUrl: latest.indexUrl,
  };
  const { instance, face } = await fetchFiling(identity.cik, filing, {
    get,
    getJson,
  });

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
    balanceSheet: { date: latest.reportDate, face },
    requestsMade,
  };
}

type InstanceResult =
  | ({ kind: "parsed" } & ReturnType<typeof parseInstance>)
  | { kind: "missing"; reason: string };

interface FilingIo {
  get: (url: string, cache?: FetchCacheOptions) => Promise<SecResponse>;
  getJson: (url: string) => Promise<SecJsonResponse>;
}

const decode = (body: Uint8Array) => new TextDecoder().decode(body);

async function fetchFiling(
  cik: string,
  filing: FilingReference,
  io: FilingIo,
): Promise<{ instance: InstanceResult; face: BalanceSheetFace }> {
  const missing = (reason: string) => ({
    instance: { kind: "missing" as const, reason },
    face: { kind: "unavailable" as const, reason },
  });
  const indexRes = await io.getJson(filingIndexJsonUrl(cik, filing.accession));
  if (indexRes.kind === "not-found")
    return missing("filing index returned 404");
  const located = locateInstance(indexRes.data);

  const face = await fetchBalanceSheet(cik, filing, indexRes.data, io);
  if (located.kind === "no-instance") return missing(located.reason);

  const res = await io.get(
    filingDocumentUrl(cik, filing.accession, located.name),
  );
  if (res.kind === "not-found")
    return {
      ...missing(`${located.name} returned 404`),
      face:
        face.kind === "face"
          ? { kind: "unavailable", reason: `${located.name} returned 404` }
          : face,
    };
  const extraConcepts =
    face.kind === "face"
      ? new Set(face.lines.map((l) => l.concept))
      : undefined;
  return {
    instance: {
      kind: "parsed",
      ...parseInstance(decode(res.body), filing, { extraConcepts }),
    },
    face,
  };
}

// Methodology 0.3.0 §7 rule 1. Filings never change, so both files are cached per
// accession; they are small (LII: 46 KB and 142 KB).
async function fetchBalanceSheet(
  cik: string,
  filing: FilingReference,
  rawIndex: unknown,
  io: FilingIo,
): Promise<BalanceSheetFace> {
  const unavailable = (reason: string): BalanceSheetFace => ({
    kind: "unavailable",
    reason,
  });
  const cache = { revalidate: STATEMENT_CACHE_SECONDS };
  const names = new Set(
    parseOrThrow(
      FilingIndexSchema,
      rawIndex,
      "filing index",
    ).directory.item.map((i) => i.name),
  );
  if (!names.has("FilingSummary.xml"))
    return unavailable("no FilingSummary.xml in the filing index");

  const summary = await io.get(
    filingDocumentUrl(cik, filing.accession, "FilingSummary.xml"),
    cache,
  );
  if (summary.kind === "not-found")
    return unavailable("FilingSummary.xml returned 404");
  const located = locateBalanceSheet(decode(summary.body));
  if (located.kind === "unavailable") return located;

  const url = filingDocumentUrl(cik, filing.accession, located.file);
  const r = await io.get(url, cache);
  if (r.kind === "not-found")
    return unavailable(`${located.file} returned 404`);
  const parsed = parseBalanceSheet(decode(r.body), filing.reportDate);
  if (parsed.kind === "unavailable") return parsed;
  return {
    kind: "face",
    url,
    statement: located.shortName,
    scale: parsed.scale,
    lines: parsed.lines,
  };
}
