// Prices this browser remembers between visits, so opening a company again doesn't
// mean entering the same prices again. Nothing here leaves the browser.
//
// Two kinds, with different lifetimes:
// - A price filled with the user's own Alpha Vantage key lives in the quote cache
//   (browserAlphaVantage.ts) until the next close is published, as before
//   (docs/licensing.md). It comes back with its own bar date and its attribution.
// - A price the user typed is the user's own input. It is kept, with the price date
//   it was entered under, until the user changes or clears it or presses "Forget key".
//   Methodology §12 already flags a price more than 7 days old (W_PRICE_STALE).
//
// Restoring never estimates and never overwrites: only an empty price box is filled,
// and a typed price comes back only under the date it was saved with.

import { isIsoDate } from "@/domain/dates";
import {
  readCachedQuote,
  type KeyValueStorage,
} from "@/prices/browserAlphaVantage";
import { PRICE_LIMIT } from "@/prices/userEntered";

export const TYPED_PRICE_PREFIX = "peerset.px.v1.";

interface SavedTyped {
  price: string; // as typed
  asOfDate: string; // the shared price date it was entered under
}

const priceNumber = (text: string) => Number(text.replace(/[$,\s]/g, ""));
const validPrice = (text: string) => {
  const n = priceNumber(text);
  return text.trim() !== "" && Number.isFinite(n) && n > 0 && n < PRICE_LIMIT;
};

export function saveTypedPrice(
  storage: KeyValueStorage | null,
  symbol: string,
  price: string,
  asOfDate: string,
) {
  if (!storage || !validPrice(price) || !isIsoDate(asOfDate)) return;
  try {
    const entry: SavedTyped = { price: price.trim(), asOfDate };
    storage.setItem(TYPED_PRICE_PREFIX + symbol, JSON.stringify(entry));
  } catch {
    // full or blocked storage: the page still works, the price just isn't kept
  }
}

export function removeTypedPrice(
  storage: KeyValueStorage | null,
  symbol: string,
) {
  try {
    storage?.removeItem(TYPED_PRICE_PREFIX + symbol);
  } catch {
    // nothing to do
  }
}

export function readTypedPrice(
  storage: KeyValueStorage | null,
  symbol: string,
  analysisDate: string,
): SavedTyped | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(TYPED_PRICE_PREFIX + symbol);
    if (raw === null) return null;
    const e = JSON.parse(raw) as SavedTyped;
    return typeof e?.price === "string" &&
      validPrice(e.price) &&
      typeof e.asOfDate === "string" &&
      isIsoDate(e.asOfDate) &&
      e.asOfDate <= analysisDate
      ? { price: e.price, asOfDate: e.asOfDate }
      : null;
  } catch {
    return null;
  }
}

export function clearTypedPrices(storage: KeyValueStorage | null) {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(TYPED_PRICE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    // nothing to do
  }
}

export interface RestoredPrices {
  inputs: Record<string, string>; // ticker → price text to put in its empty box
  filled: Record<string, { close: number; asOfDate: string }>; // key-filled ones
  priceDate?: string; // set when the shared price date should change
}

// What to put back for the tickers whose price box is empty.
//
// A key-filled close still in the quote cache wins: it carries its own date. A typed
// price shares one date with every other typed price on the page, so it is restored
// only under that date: the page's current one when a typed price is already there
// (typedDate), otherwise the most recent date among the saved ones.
export function restorePrices(input: {
  storage: KeyValueStorage | null;
  tickers: readonly string[]; // those with an empty price box
  typedDate: string | null; // the price date in use by typed prices; null if none
  analysisDate: string;
  now: Date;
}): RestoredPrices {
  const out: RestoredPrices = { inputs: {}, filled: {} };
  const typed: [string, SavedTyped][] = [];
  for (const t of new Set(input.tickers)) {
    const cached = readCachedQuote(input.storage, t, input.now);
    if (cached && cached.asOfDate <= input.analysisDate) {
      out.inputs[t] = String(cached.close);
      out.filled[t] = { close: cached.close, asOfDate: cached.asOfDate };
      continue;
    }
    const saved = readTypedPrice(input.storage, t, input.analysisDate);
    if (saved) typed.push([t, saved]);
  }
  if (typed.length > 0) {
    const date =
      input.typedDate ??
      typed.map(([, s]) => s.asOfDate).reduce((a, b) => (a > b ? a : b));
    for (const [t, s] of typed)
      if (s.asOfDate === date) out.inputs[t] = s.price;
    const restoredTyped = typed.some(([t]) => t in out.inputs);
    if (restoredTyped && input.typedDate === null) out.priceDate = date;
  }
  return out;
}
