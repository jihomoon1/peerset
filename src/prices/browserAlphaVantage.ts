// Bring-your-own-key price fill (v1.1, docs/licensing.md). Runs only in the visitor's
// browser: it calls www.alphavantage.co directly with the visitor's own free key, so
// no PeerSet route, log or cache ever receives the key or a quote. Filled prices are
// user inputs, exactly like typed prices.
//
// Hard rules kept here:
// - the key appears only in the Alpha Vantage URL, never in a message, the cache or
//   PeerSet's URL state;
// - requests go one at a time, BROWSER_MIN_INTERVAL_MS apart, at most
//   MAX_FILL_SYMBOLS per click;
// - a limit payload (daily cap or burst) stops the fill at once and keeps what was
//   already filled.

import type { QuoteSnapshot } from "@/domain/types";
import { isIsoDate } from "@/domain/dates";
import { nextQuoteRefresh } from "@/lib/marketClock";
import {
  ALPHA_VANTAGE_HOST,
  classifyMessage,
  parseDailySeries,
  quoteUrl,
  SYMBOL_PATTERN,
  toProviderSymbol,
} from "./alphaVantage";

export const USER_KEY_SOURCE = "alpha_vantage_user_key" as const;
// Alpha Vantage publishes 25 requests per day for a free key and no per-minute
// figure; its burst notice asks for "1 request per second" (recorded 2026-10-26).
// 1.2 s keeps a margin over that.
export const BROWSER_MIN_INTERVAL_MS = 1_200;
// One target and up to 12 peers (methodology §13A), one class each at most.
export const MAX_FILL_SYMBOLS = 13;
const TIMEOUT_MS = 10_000;

export const QUOTE_CACHE_PREFIX = "peerset.av.v1.";
export const KEY_STORAGE_NAME = "peerset.avKey";

// The part of the Web Storage API this file uses; tests pass a Map-backed fake.
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

// localStorage when the browser allows it, else null. Private windows, blocked site
// data and thumbnails can throw on access, so every storage touch is guarded.
export function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function safeGet(storage: KeyValueStorage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: KeyValueStorage | null, key: string, value: string) {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // full or blocked storage: the fill still works, only the cache is lost
  }
}

function safeRemove(storage: KeyValueStorage | null, key: string) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // nothing to do
  }
}

// ── Remembered key ("Remember on this device", off by default) ────────────

export function readRememberedKey(storage: KeyValueStorage | null): string {
  return safeGet(storage, KEY_STORAGE_NAME) ?? "";
}

export function rememberKey(storage: KeyValueStorage | null, key: string) {
  safeSet(storage, KEY_STORAGE_NAME, key);
}

export function forgetRememberedKey(storage: KeyValueStorage | null) {
  safeRemove(storage, KEY_STORAGE_NAME);
}

// ── Quote cache: per symbol, until the next close is published ─────────────

interface CachedQuote {
  close: number;
  asOfDate: string;
  fetchedAt: string;
}

export function readCachedQuote(
  storage: KeyValueStorage | null,
  symbol: string,
  now: Date,
): QuoteSnapshot | null {
  const raw = safeGet(storage, QUOTE_CACHE_PREFIX + symbol);
  if (raw === null) return null;
  let entry: CachedQuote;
  try {
    entry = JSON.parse(raw) as CachedQuote;
  } catch {
    return null;
  }
  if (
    typeof entry?.close !== "number" ||
    !(entry.close > 0) ||
    typeof entry.asOfDate !== "string" ||
    !isIsoDate(entry.asOfDate) ||
    typeof entry.fetchedAt !== "string"
  )
    return null;
  const fetched = new Date(entry.fetchedAt);
  if (Number.isNaN(fetched.getTime()) || fetched > now) return null;
  // Same rule as the server's quote cache (blueprint §14): good until 6 p.m. ET on
  // the next weekday after it was fetched.
  if (now >= nextQuoteRefresh(fetched).cutoff) return null;
  return {
    symbol,
    close: entry.close,
    currency: "USD",
    asOfDate: entry.asOfDate,
    source: USER_KEY_SOURCE,
    retrievedAt: entry.fetchedAt,
  };
}

function writeCachedQuote(storage: KeyValueStorage | null, q: QuoteSnapshot) {
  const entry: CachedQuote = {
    close: q.close,
    asOfDate: q.asOfDate,
    fetchedAt: q.retrievedAt,
  };
  safeSet(storage, QUOTE_CACHE_PREFIX + q.symbol, JSON.stringify(entry));
}

export function clearQuoteCache(storage: KeyValueStorage | null) {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(QUOTE_CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    // nothing to do
  }
}

// ── The fill ──────────────────────────────────────────────────────────────

export type FillRow =
  | { symbol: string; status: "filled" | "cached"; quote: QuoteSnapshot }
  | {
      symbol: string;
      status: "unknown_symbol" | "failed" | "not_tried";
      reason: string;
    };

export type FillStop = "daily_limit" | "burst" | "invalid_key" | "aborted";

export interface FillResult {
  rows: FillRow[];
  stopped: FillStop | null;
}

export interface FillOptions {
  symbols: readonly string[];
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  storage?: KeyValueStorage | null;
  signal?: AbortSignal;
  onProgress?: (row: FillRow, done: number, total: number) => void;
}

const REASONS = {
  unknown: "Alpha Vantage doesn't know this symbol",
  plain: "not a plain ticker symbol",
  request: "the request to Alpha Vantage failed",
  json: "Alpha Vantage's answer wasn't readable",
  noPrice: "Alpha Vantage returned no finished close",
  tooMany: `at most ${MAX_FILL_SYMBOLS} prices per fill`,
  stopped: "not tried: the fill stopped",
} as const;

// Fills each symbol in order. Never throws for a provider answer: every outcome is a
// row status, so the caller can keep partial results. Messages are fixed strings and
// the symbol, never the URL (which holds the key) or a thrown error's text.
export async function fillQuotes(opts: FillOptions): Promise<FillResult> {
  const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const now = opts.now ?? (() => new Date());
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const storage = opts.storage === undefined ? browserStorage() : opts.storage;
  const total = opts.symbols.length;
  const rows: FillRow[] = [];
  let stopped: FillStop | null = null;
  let lastStart: number | null = null;

  const push = (row: FillRow) => {
    rows.push(row);
    opts.onProgress?.(row, rows.length, total);
  };

  for (const [i, symbol] of opts.symbols.entries()) {
    if (stopped === null && opts.signal?.aborted) stopped = "aborted";
    if (stopped !== null) {
      push({ symbol, status: "not_tried", reason: REASONS.stopped });
      continue;
    }
    if (i >= MAX_FILL_SYMBOLS) {
      push({ symbol, status: "not_tried", reason: REASONS.tooMany });
      continue;
    }
    if (!SYMBOL_PATTERN.test(symbol)) {
      push({ symbol, status: "failed", reason: REASONS.plain });
      continue;
    }
    const cached = readCachedQuote(storage, symbol, now());
    if (cached) {
      push({ symbol, status: "cached", quote: cached });
      continue;
    }

    const providerSymbol = toProviderSymbol(symbol);
    const url = quoteUrl(providerSymbol, opts.apiKey);
    if (url.host !== ALPHA_VANTAGE_HOST) {
      push({ symbol, status: "failed", reason: REASONS.request });
      continue;
    }
    if (lastStart !== null) {
      const wait = lastStart + BROWSER_MIN_INTERVAL_MS - now().getTime();
      if (wait > 0) await sleep(wait);
    }
    if (opts.signal?.aborted) {
      stopped = "aborted";
      push({ symbol, status: "not_tried", reason: REASONS.stopped });
      continue;
    }
    lastStart = now().getTime();

    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: opts.signal
          ? AbortSignal.any([opts.signal, AbortSignal.timeout(TIMEOUT_MS)])
          : AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      if (opts.signal?.aborted) {
        stopped = "aborted";
        push({ symbol, status: "not_tried", reason: REASONS.stopped });
      } else push({ symbol, status: "failed", reason: REASONS.request });
      continue;
    }
    if (!res.ok) {
      push({
        symbol,
        status: "failed",
        reason: `Alpha Vantage answered HTTP ${res.status}`,
      });
      continue;
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      push({ symbol, status: "failed", reason: REASONS.json });
      continue;
    }

    const message = classifyMessage(body);
    if (message === "unknown_symbol") {
      push({ symbol, status: "unknown_symbol", reason: REASONS.unknown });
      continue;
    }
    if (message !== null) {
      stopped = message;
      push({ symbol, status: "not_tried", reason: REASONS.stopped });
      continue;
    }
    let quote: QuoteSnapshot;
    try {
      quote = parseDailySeries(
        body,
        symbol,
        now().toISOString(),
        providerSymbol,
        USER_KEY_SOURCE,
      );
    } catch {
      push({ symbol, status: "failed", reason: REASONS.noPrice });
      continue;
    }
    writeCachedQuote(storage, quote);
    push({ symbol, status: "filled", quote });
  }
  return { rows, stopped };
}

// The one-line outcome shown under the Fill button (and announced).
export function fillSummary(result: FillResult): string {
  const total = result.rows.length;
  const got = result.rows.filter(
    (r) => r.status === "filled" || r.status === "cached",
  ).length;
  switch (result.stopped) {
    case "daily_limit":
      return `Alpha Vantage's daily limit was reached; filled ${got} of ${total}. Enter the rest by hand or try tomorrow.`;
    case "burst":
      return `Alpha Vantage asked for slower requests; filled ${got} of ${total}. Try Fill again in a minute.`;
    case "invalid_key":
      return "Alpha Vantage didn't accept this key. Check it at alphavantage.co.";
    case "aborted":
      return `Fill stopped; filled ${got} of ${total}.`;
    default: {
      const missed = total - got;
      return missed === 0
        ? `Filled ${got} of ${total} prices.`
        : `Filled ${got} of ${total} prices; ${missed} left for you to enter.`;
    }
  }
}
