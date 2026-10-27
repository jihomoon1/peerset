// Server-side quotes for the /api/quotes route and the /c/[ticker] page (blueprint
// §9, §14). Only in PRICE_PROVIDER=alpha_vantage mode; each symbol is cached until
// 6 p.m. ET on the next weekday. Errors never hold the API key.

import { METHODOLOGY_VERSION } from "@/domain/policy";
import type { QuoteSnapshot } from "@/domain/types";
import { createAlphaVantageProvider } from "@/prices/alphaVantage";
import {
  priceProviderName,
  type PriceProviderName,
  type QuoteProvider,
} from "@/prices/provider";
import { TICKER_PATTERN } from "@/sec/tickers";
import { nextCache, type CacheFn } from "./cache";
import {
  InvalidInputError,
  PeerSetError,
  PriceUnavailableError,
  type ErrorCode,
} from "./errors";
import { log, type Logger } from "./log";
import { nextQuoteRefresh } from "./marketClock";

export const MAX_QUOTE_SYMBOLS = 12; // blueprint §13: at most 12 peers

export interface QuoteDeps {
  mode: PriceProviderName;
  provider: QuoteProvider | null; // null in user mode
  cache: CacheFn;
  now: Date;
  logger: Logger;
}

export function defaultQuoteDeps(
  env: Record<string, string | undefined> = process.env,
): QuoteDeps {
  const mode = priceProviderName(env);
  const apiKey = env.ALPHAVANTAGE_API_KEY;
  return {
    mode,
    provider:
      mode === "alpha_vantage" && apiKey
        ? createAlphaVantageProvider({ apiKey })
        : null,
    cache: nextCache,
    now: new Date(),
    logger: log,
  };
}

export interface QuoteError {
  symbol: string;
  code: ErrorCode;
  message: string;
}

export interface QuotesResult {
  quotes: QuoteSnapshot[];
  errors: QuoteError[];
}

export function parseSymbols(raw: string | null): string[] {
  const symbols = [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (symbols.length === 0)
    throw new InvalidInputError("Enter one or more tickers, for example LII");
  if (symbols.length > MAX_QUOTE_SYMBOLS)
    throw new InvalidInputError(
      `At most ${MAX_QUOTE_SYMBOLS} tickers at a time`,
    );
  const bad = symbols.find((s) => !TICKER_PATTERN.test(s));
  if (bad !== undefined)
    throw new InvalidInputError(
      "A ticker is 1–10 letters, digits, dots or dashes, starting with a letter",
      `malformed ticker (${bad.length} chars)`,
    );
  return symbols;
}

export async function loadQuotes(
  symbols: readonly string[],
  deps: QuoteDeps,
): Promise<QuotesResult> {
  const provider = deps.provider;
  if (!provider) throw new PriceUnavailableError("price provider is off");
  const refresh = nextQuoteRefresh(deps.now);
  const out: QuotesResult = { quotes: [], errors: [] };
  for (const symbol of symbols) {
    const started = Date.now();
    let hit = true;
    try {
      // A rejected promise isn't cached, so a rate limit is retried next request.
      const quote = await deps.cache(
        ["quote", symbol, refresh.cutoffDate, METHODOLOGY_VERSION],
        refresh.seconds,
        () => {
          hit = false;
          return provider.getQuote(symbol);
        },
      );
      out.quotes.push(quote);
      deps.logger("quote", {
        symbol,
        cacheHit: hit,
        asOfDate: quote.asOfDate,
        ms: Date.now() - started,
      });
    } catch (err) {
      const e =
        err instanceof PeerSetError
          ? err
          : new PriceUnavailableError(`${symbol}: unclassified error`);
      out.errors.push({ symbol, code: e.code, message: e.userMessage });
      deps.logger("quote_error", { symbol, code: e.code, detail: e.detail });
    }
  }
  return out;
}
