// Server-side loading of one company's fundamentals, shared by the API route and the
// /c/[ticker] page: ticker → CIK (SEC ticker list) → latest filing (submissions) →
// cached fundamentals keyed by CIK + latest accession + methodology version.

import {
  buildFundamentals,
  type CompanyFundamentals,
} from "@/domain/fundamentals";
import { METHODOLOGY_VERSION } from "@/domain/policy";
import { createSecClient, type SecClient } from "@/sec/client";
import { getCompanyFacts } from "@/sec/freshness";
import { identityFromSubmissions, parseSubmissions } from "@/sec/submissions";
import {
  lookupTicker,
  parseTickerTable,
  TICKER_LIST_URL,
  TICKER_PATTERN,
} from "@/sec/tickers";
import { submissionsUrl } from "@/sec/urls";
import { nextCache, type CacheFn } from "./cache";
import {
  InvalidInputError,
  SecUnavailableError,
  UnsupportedIssuerError,
} from "./errors";
import { log, type Logger } from "./log";

// Blueprint §14 lifetimes, in seconds.
export const CACHE_SECONDS = {
  tickerList: 24 * 3600,
  submissions: 6 * 3600,
  fundamentals: 24 * 3600,
} as const;

// Vercel's Data Cache refuses items over 2 MB (blueprint §14).
export const CACHE_ITEM_LIMIT_BYTES = 2 * 1024 * 1024;

export interface LoadDeps {
  client: SecClient;
  cache: CacheFn;
  asOf: string; // today, ISO; the domain never reads the clock
  logger: Logger;
}

export function defaultDeps(): LoadDeps {
  return {
    client: createSecClient(),
    cache: nextCache,
    asOf: new Date().toISOString().slice(0, 10),
    logger: log,
  };
}

export function normalizeTicker(raw: string | null | undefined): string {
  const ticker = (raw ?? "").trim().toUpperCase();
  if (!ticker) throw new InvalidInputError("Enter a ticker, for example LII");
  if (!TICKER_PATTERN.test(ticker))
    throw new InvalidInputError(
      "A ticker is 1–10 letters, digits, dots or dashes, starting with a letter",
      `malformed ticker (${ticker.length} chars)`,
    );
  return ticker;
}

export async function loadFundamentals(
  rawTicker: string | null | undefined,
  deps: LoadDeps,
): Promise<CompanyFundamentals> {
  const started = Date.now();
  const ticker = normalizeTicker(rawTicker);
  const { client, asOf } = deps;

  const list = await client.getJson(TICKER_LIST_URL, {
    revalidate: CACHE_SECONDS.tickerList,
  });
  if (list.kind === "not-found")
    throw new SecUnavailableError("ticker list returned 404");
  const { cik } = lookupTicker(parseTickerTable(list.data), ticker);

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

  let hit = true;
  let secRequests = 2;
  const fundamentals = await deps.cache(
    ["fundamentals", cik, accession, METHODOLOGY_VERSION],
    CACHE_SECONDS.fundamentals,
    async () => {
      hit = false;
      const facts = await getCompanyFacts(cik, {
        asOf,
        client,
        submissionsRevalidate: CACHE_SECONDS.submissions,
      });
      secRequests += facts.requestsMade;
      return buildFundamentals(facts);
    },
  );

  const bytes = Buffer.byteLength(JSON.stringify(fundamentals));
  deps.logger("fundamentals", {
    ticker,
    cik,
    accession,
    cacheHit: hit,
    secRequests,
    bytes,
    overCacheLimit: bytes > CACHE_ITEM_LIMIT_BYTES,
    ms: Date.now() - started,
  });
  return fundamentals;
}
