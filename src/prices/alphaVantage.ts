// Alpha Vantage TIME_SERIES_DAILY adapter (blueprint §9): compact output, the latest
// row's close and date. Errors and rate limits come back as HTTP 200 with a message
// key instead of the series. Server-side only; the key never reaches a log, an error
// detail or the browser.

import * as z from "zod";
import { isIsoDate } from "@/domain/dates";
import type { QuoteSnapshot } from "@/domain/types";
import { PriceRateLimitedError, PriceUnavailableError } from "@/lib/errors";
import type { QuoteProvider } from "./provider";
import { PRICE_LIMIT } from "./userEntered";

export const ALPHA_VANTAGE_HOST = "www.alphavantage.co"; // CLAUDE.md allow-list
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;
const TIMEOUT_MS = 10_000;
// The free tier answers a second request within the same second with a burst notice
// (recorded 2026-10-26), so calls go one at a time, at least this far apart.
export const MIN_INTERVAL_MS = 1_100;

// SEC's ticker spelling → Alpha Vantage's. Identity: a live check on 2026-10-26 showed
// Alpha Vantage accepts SEC's class spelling as is (WSO-B; fixture WSO-B.json).
export function toProviderSymbol(ticker: string): string {
  return ticker;
}

export function quoteUrl(providerSymbol: string, apiKey: string): URL {
  const url = new URL(`https://${ALPHA_VANTAGE_HOST}/query`);
  url.searchParams.set("function", "TIME_SERIES_DAILY");
  url.searchParams.set("symbol", providerSymbol);
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("apikey", apiKey);
  return url;
}

const DailySeriesSchema = z.object({
  "Meta Data": z.object({ "2. Symbol": z.string() }).optional(),
  "Time Series (Daily)": z.record(
    z.string(),
    z.object({ "4. close": z.string() }),
  ),
});

const MessageSchema = z.union([
  z.object({ "Error Message": z.string() }),
  z.object({ Information: z.string() }),
  z.object({ Note: z.string() }),
]);

// `symbol` is the ticker the caller asked for; the snapshot carries it unchanged.
export function parseDailySeries(
  body: unknown,
  symbol: string,
  retrievedAt: string,
  providerSymbol = toProviderSymbol(symbol),
): QuoteSnapshot {
  const message = MessageSchema.safeParse(body);
  if (message.success) {
    const m = message.data;
    if ("Error Message" in m)
      throw new PriceUnavailableError(`${symbol}: provider error message`);
    throw new PriceRateLimitedError(`${symbol}: provider limit message`);
  }
  const parsed = DailySeriesSchema.safeParse(body);
  if (!parsed.success)
    throw new PriceUnavailableError(`${symbol}: unexpected response shape`);
  const meta = parsed.data["Meta Data"]?.["2. Symbol"];
  if (meta !== undefined && meta.toUpperCase() !== providerSymbol.toUpperCase())
    throw new PriceUnavailableError(
      `${symbol}: series is for ${meta}, not ${providerSymbol}`,
    );
  const dates = Object.keys(parsed.data["Time Series (Daily)"]);
  if (dates.length === 0)
    throw new PriceUnavailableError(`${symbol}: no daily rows`);
  if (!dates.every(isIsoDate))
    throw new PriceUnavailableError(`${symbol}: row key is not an ISO date`);
  const latest = dates.reduce((a, b) => (a > b ? a : b));
  const raw = parsed.data["Time Series (Daily)"][latest]["4. close"];
  const close = Number(raw);
  if (!/^\d+(\.\d+)?$/.test(raw) || !(close > 0) || close >= PRICE_LIMIT)
    throw new PriceUnavailableError(
      `${symbol}: close on ${latest} is not a price`,
    );
  return {
    symbol,
    close,
    currency: "USD",
    asOfDate: latest,
    source: "alpha_vantage",
    retrievedAt,
  };
}

export function createAlphaVantageProvider(options: {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}): QuoteProvider {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart: number | null = null;

  // Serializes requests and keeps MIN_INTERVAL_MS between their starts.
  function paced<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      if (lastStart !== null) {
        const wait = lastStart + MIN_INTERVAL_MS - now().getTime();
        if (wait > 0) await sleep(wait);
      }
      lastStart = now().getTime();
      return task();
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    async getQuote(symbol) {
      if (!SYMBOL_PATTERN.test(symbol))
        throw new PriceUnavailableError("ticker is not a plain symbol");
      const providerSymbol = toProviderSymbol(symbol);
      const url = quoteUrl(providerSymbol, options.apiKey);
      if (url.host !== ALPHA_VANTAGE_HOST)
        throw new PriceUnavailableError("host not allowed");
      let res: Response;
      try {
        res = await paced(() =>
          fetchFn(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }),
        );
      } catch {
        // The thrown error may quote the URL, which holds the key: never keep it.
        throw new PriceUnavailableError(`${symbol}: request failed`);
      }
      if (!res.ok)
        throw new PriceUnavailableError(`${symbol}: HTTP ${res.status}`);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new PriceUnavailableError(`${symbol}: response is not JSON`);
      }
      return parseDailySeries(
        body,
        symbol,
        now().toISOString(),
        providerSymbol,
      );
    },
  };
}
