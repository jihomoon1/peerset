// Server-side loading of one company's fundamentals, shared by the API route and the
// /c/[ticker] page: ticker → CIK (SEC ticker list) → latest filing (submissions) →
// cached fundamentals keyed by CIK + latest accession + methodology version.

import {
  buildFundamentals,
  type CompanyFundamentals,
} from "@/domain/fundamentals";
import { METHODOLOGY_VERSION } from "@/domain/policy";
import { createLimiter, createSecClient, type SecClient } from "@/sec/client";
import { getCompanyFacts } from "@/sec/freshness";
import { identityFromSubmissions, parseSubmissions } from "@/sec/submissions";
import { fixtureFetch, allFixtureDirs } from "@/sec/fixtureFetch";
import {
  lookupTicker,
  parseTickerTable,
  TICKER_LIST_URL,
  type TickerTable,
} from "@/sec/tickers";
import { submissionsUrl } from "@/sec/urls";
import { memoryCache, nextCache, type CacheFn } from "./cache";
import {
  InvalidInputError,
  SecUnavailableError,
  UnsupportedIssuerError,
} from "./errors";
import { FIXTURE_AS_OF, fixtureModeOn } from "./fixtureMode";
import { log, type Logger } from "./log";
import { TICKER_PATTERN, TICKER_SHAPE_MESSAGE } from "./ticker";

// Blueprint §14 lifetimes, in seconds.
export const CACHE_SECONDS = {
  tickerList: 24 * 3600,
  submissions: 6 * 3600,
  fundamentals: 24 * 3600,
} as const;

// Bump by hand when the cached fundamentals' shape or values change without a
// methodology bump (a bug fix, a new field), so no instance serves the old entry.
export const FUNDAMENTALS_CACHE_VERSION = 1;

// Vercel's Data Cache refuses items over 2 MB (blueprint §14).
export const CACHE_ITEM_LIMIT_BYTES = 2 * 1024 * 1024;

export interface LoadDeps {
  client: SecClient;
  cache: CacheFn;
  asOf: string; // today, ISO; the domain never reads the clock
  logger: Logger;
  now?: () => Date; // stamps when SEC data was pulled; defaults to the clock
  tickerTable?: TickerTableMemo; // per-instance memo of the parsed ticker list
}

// Best-effort, per-instance memo of the parsed ticker list (ADR 0009). It saves a
// limiter slot and a 0.5 MB parse on every company load; the list changes rarely
// and its fetch cache already lasts 24 h. Submissions is never memoized here: it is
// how a new filing is discovered.
export interface TickerTableMemo {
  get(load: () => Promise<TickerTable>): Promise<TickerTable>;
}

export function tickerTableMemo(
  ttlMs: number,
  clock: () => number = Date.now,
): TickerTableMemo {
  let held: { table: TickerTable; at: number } | null = null;
  return {
    async get(load) {
      if (held && clock() - held.at <= ttlMs) return held.table;
      const table = await load();
      held = { table, at: clock() };
      return table;
    },
  };
}

const liveTickerTable = tickerTableMemo(CACHE_SECONDS.tickerList * 1000);

// Fundamentals plus when their SEC data was pulled (the as-of strip's "data pulled
// at", blueprint §6). Stamped inside the cache, so a cached copy keeps its pull time.
export type LoadedFundamentals = CompanyFundamentals & { pulledAt: string };

const fixtureCache = memoryCache();
const fixtureLimiter = createLimiter(0);

export function defaultDeps(
  env: Record<string, string | undefined> = process.env,
): LoadDeps {
  // Fixture mode (e2e only, refused in production): frozen SEC responses, a dummy
  // User-Agent, an in-memory cache (never the persistent one) and the goldens'
  // analysis date. No pacing: nothing reaches SEC.
  if (fixtureModeOn(env))
    return {
      client: createSecClient({
        fetch: fixtureFetch(allFixtureDirs()).fetch,
        env: { SEC_USER_AGENT: "PeerSet-Fixtures fixtures@example.invalid" },
        limiter: fixtureLimiter,
      }),
      cache: fixtureCache,
      asOf: FIXTURE_AS_OF,
      logger: log,
    };
  return {
    client: createSecClient({ env }),
    cache: nextCache,
    asOf: new Date().toISOString().slice(0, 10),
    logger: log,
    tickerTable: liveTickerTable,
  };
}

export function normalizeTicker(raw: string | null | undefined): string {
  const ticker = (raw ?? "").trim().toUpperCase();
  if (!ticker) throw new InvalidInputError("Enter a ticker, for example LII");
  if (!TICKER_PATTERN.test(ticker))
    throw new InvalidInputError(
      TICKER_SHAPE_MESSAGE,
      `malformed ticker (${ticker.length} chars)`,
    );
  return ticker;
}

export async function loadFundamentals(
  rawTicker: string | null | undefined,
  deps: LoadDeps,
): Promise<LoadedFundamentals> {
  const started = Date.now();
  const ticker = normalizeTicker(rawTicker);
  const { client, asOf } = deps;

  let tickerListRequested = false;
  const readTickerTable = async () => {
    tickerListRequested = true;
    const list = await client.getJson(TICKER_LIST_URL, {
      revalidate: CACHE_SECONDS.tickerList,
    });
    if (list.kind === "not-found")
      throw new SecUnavailableError("ticker list returned 404");
    return parseTickerTable(list.data);
  };
  const table = deps.tickerTable
    ? await deps.tickerTable.get(readTickerTable)
    : await readTickerTable();
  const { cik } = lookupTicker(table, ticker);

  // The latest accession is part of the cache key, so a new filing is picked up as
  // soon as submissions (6 h) shows it.
  const subs = await client.getJson(submissionsUrl(cik), {
    revalidate: CACHE_SECONDS.submissions,
  });
  if (subs.kind === "not-found")
    throw new SecUnavailableError(`submissions returned 404 for CIK ${cik}`);
  const identity = identityFromSubmissions(parseSubmissions(subs.data), {
    asOf,
  });
  if (!identity.support.supported)
    throw new UnsupportedIssuerError(
      identity.support.reason.message,
      `${identity.support.reason.code} (CIK ${cik})`,
    );
  const accession = identity.latestPeriodic?.accession ?? "none";

  const { fundamentals, cacheHit, secRequests } = await getFundamentals(
    cik,
    accession,
    deps,
  );

  const bytes = Buffer.byteLength(JSON.stringify(fundamentals));
  deps.logger("fundamentals", {
    ticker,
    cik,
    accession,
    cacheHit,
    // The ticker list and submissions go through Next's fetch cache (24 h, 6 h), so
    // these may not have reached SEC; the rest did, and only on a miss. The ticker
    // list is skipped entirely when the instance memo holds it.
    secRequestsMax: (tickerListRequested ? 2 : 1) + secRequests,
    bytes,
    overCacheLimit: bytes > CACHE_ITEM_LIMIT_BYTES,
    ms: Date.now() - started,
  });
  return fundamentals;
}

// The one cached step the page and the API share (blueprint §14): keyed by CIK +
// latest accession + methodology version, so a new filing or methodology change
// gets a fresh entry. `secRequests` counts the requests made on a miss.
export async function getFundamentals(
  cik: string,
  accession: string,
  deps: LoadDeps,
): Promise<{
  fundamentals: LoadedFundamentals;
  cacheHit: boolean;
  secRequests: number;
}> {
  const { client, asOf } = deps;
  let cacheHit = true;
  let secRequests = 0;
  const fundamentals = await deps.cache<LoadedFundamentals>(
    [
      "fundamentals",
      cik,
      accession,
      METHODOLOGY_VERSION,
      `cache-v${FUNDAMENTALS_CACHE_VERSION}`,
    ],
    CACHE_SECONDS.fundamentals,
    async () => {
      cacheHit = false;
      const facts = await getCompanyFacts(cik, {
        asOf,
        client,
        submissionsRevalidate: CACHE_SECONDS.submissions,
      });
      secRequests = facts.requestsMade;
      return {
        ...buildFundamentals(facts),
        pulledAt: (deps.now ?? (() => new Date()))().toISOString(),
      };
    },
  );
  return { fundamentals, cacheHit, secRequests };
}
