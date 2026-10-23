// TEMPORARY M0 spike: proves SEC data access from this runtime. Removed at the end of M0.
// Not the real SEC client (that is M1). No caching; at most 2 SEC requests per call.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CIK = "0001069202"; // LII
const URLS = {
  submissions: `https://data.sec.gov/submissions/CIK${CIK}.json`,
  companyfacts: `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`,
};
const MAX_SEC_REQUESTS = 2;
const TIMEOUT_MS = 10_000;
const PERIODIC_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A"]);

type Attempt = {
  status: number | null;
  ms: number;
  contentLengthHeader: string | null;
  contentEncoding: string | null;
  decodedBytes: number | null;
  error?: string;
  bodyExcerpt?: string;
};

type FetchResult = { url: string; attempts: Attempt[]; json?: unknown };

async function fetchOnce(
  url: string,
  userAgent: string,
): Promise<{ attempt: Attempt; text?: string }> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip, deflate" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    const attempt: Attempt = {
      status: res.status,
      ms: Math.round(performance.now() - started),
      contentLengthHeader: res.headers.get("content-length"),
      contentEncoding: res.headers.get("content-encoding"),
      decodedBytes: new TextEncoder().encode(text).byteLength,
    };
    if (!res.ok) attempt.bodyExcerpt = text.slice(0, 500);
    return { attempt, text };
  } catch (err) {
    return {
      attempt: {
        status: null,
        ms: Math.round(performance.now() - started),
        contentLengthHeader: null,
        contentEncoding: null,
        decodedBytes: null,
        error:
          err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
    };
  }
}

export async function GET() {
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent) {
    return Response.json(
      { error: "SEC_USER_AGENT is not set" },
      { status: 500 },
    );
  }

  let budget = MAX_SEC_REQUESTS;

  // One retry at most, only on 5xx or network/timeout errors; never on 4xx (403 means stop).
  async function get(url: string): Promise<FetchResult> {
    const result: FetchResult = { url, attempts: [] };
    for (let tries = 0; tries < 2 && budget > 0; tries++) {
      budget--;
      const { attempt, text } = await fetchOnce(url, userAgent!);
      result.attempts.push(attempt);
      if (attempt.status === 200 && text) {
        result.json = JSON.parse(text);
        return result;
      }
      const retryable = attempt.status === null || attempt.status >= 500;
      if (!retryable) return result;
    }
    return result;
  }

  const submissions = await get(URLS.submissions);
  const companyfacts =
    budget > 0
      ? await get(URLS.companyfacts)
      : {
          url: URLS.companyfacts,
          attempts: [],
          skipped: "request budget used by retry",
        };

  // Latest periodic filing (by report date, per blueprint §8.3) from submissions.
  let latestPeriodic: {
    accession: string;
    form: string;
    filingDate: string;
    reportDate: string;
  } | null = null;
  const recent = (
    submissions.json as
      { filings?: { recent?: Record<string, string[]> } } | undefined
  )?.filings?.recent;
  if (recent) {
    for (let i = 0; i < recent.accessionNumber.length; i++) {
      if (!PERIODIC_FORMS.has(recent.form[i])) continue;
      const row = {
        accession: recent.accessionNumber[i],
        form: recent.form[i],
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
      };
      if (!latestPeriodic || row.reportDate > latestPeriodic.reportDate)
        latestPeriodic = row;
    }
  }

  // Newest accession in companyfacts (by filed date) and whether the latest periodic one is present.
  let newestInFacts: { accession: string; filed: string } | null = null;
  const accessions = new Set<string>();
  const facts = (companyfacts as FetchResult).json as
    | {
        facts?: Record<
          string,
          Record<
            string,
            { units: Record<string, { accn: string; filed: string }[]> }
          >
        >;
      }
    | undefined;
  if (facts?.facts) {
    for (const taxonomy of Object.values(facts.facts)) {
      for (const concept of Object.values(taxonomy)) {
        for (const rows of Object.values(concept.units)) {
          for (const row of rows) {
            accessions.add(row.accn);
            if (!newestInFacts || row.filed > newestInFacts.filed)
              newestInFacts = { accession: row.accn, filed: row.filed };
          }
        }
      }
    }
  }

  const summarize = (r: FetchResult | (FetchResult & { skipped: string })) => ({
    url: r.url,
    attempts: r.attempts,
    ...("skipped" in r ? { skipped: r.skipped } : {}),
  });

  return Response.json({
    checkedAt: new Date().toISOString(),
    runtime: process.env.VERCEL
      ? `vercel ${process.env.VERCEL_REGION ?? "unknown-region"}`
      : "local",
    secRequestsMade: MAX_SEC_REQUESTS - budget,
    submissions: summarize(submissions),
    companyfacts: summarize(companyfacts as FetchResult),
    latestPeriodic,
    newestAccessionInCompanyfacts: newestInFacts,
    companyfactsAccessionCount: accessions.size,
    latestPeriodicInCompanyfacts:
      latestPeriodic && facts?.facts
        ? accessions.has(latestPeriodic.accession)
        : null,
  });
}
