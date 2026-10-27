// Price inputs → quotes, and how valuation cells read (blueprint §6, §13). Pure, so
// it is tested without a browser; ValuationBlock only calls these.

import { normalizeSymbol } from "@/domain/capitalization";
import type { CompanyIdentity } from "@/domain/types";
import { isIsoDate } from "@/domain/dates";
import { NM_REASON_TEXT } from "@/domain/nm";
import type { Metric, QuoteSnapshot } from "@/domain/types";
import { formatMillions, formatMultiple, formatPerShare } from "@/lib/format";
import { userQuote } from "@/prices/userEntered";

// "WSO, 450.00" / "WSO-B\t$1,451.25" lines → a price text per known ticker.
export function parsePastedPrices(
  text: string,
  tickers: readonly string[],
): { prices: Record<string, string>; unmatched: string[] } {
  const prices: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m =
      /^([A-Za-z][A-Za-z0-9.\-/]{0,11})[\s,;:]+\$?\s*([\d,]+(?:\.\d+)?)$/.exec(
        line,
      );
    const ticker = m
      ? tickers.find((t) => normalizeSymbol(t) === normalizeSymbol(m[1]))
      : undefined;
    if (m && ticker) prices[ticker] = m[2].replace(/,/g, "");
    else unmatched.push(line);
  }
  return { prices, unmatched };
}

// The price-date input's starting value in Alpha Vantage mode: the earliest provider
// date, the same date the as-of strip shows (methodology §6).
export function providerPriceDate(
  providerQuotes: readonly QuoteSnapshot[],
): string | undefined {
  return providerQuotes.length
    ? providerQuotes.map((q) => q.asOfDate).reduce((a, b) => (a < b ? a : b))
    : undefined;
}

export function quotesFromInputs(input: {
  inputs: Record<string, string>; // ticker → price text as typed
  priceDate: string;
  analysisDate: string;
  retrievedAt: string;
  providerQuotes: readonly QuoteSnapshot[];
}): {
  quotes: QuoteSnapshot[];
  errors: Record<string, string>;
  dateError?: string;
} {
  const entered = Object.entries(input.inputs).filter(([, t]) => t.trim());
  if (entered.length === 0) return { quotes: [], errors: {} };
  if (!isIsoDate(input.priceDate))
    return {
      quotes: [],
      errors: {},
      dateError: "Price date must be a real date (YYYY-MM-DD)",
    };
  if (input.priceDate > input.analysisDate)
    return {
      quotes: [],
      errors: {},
      dateError: `Price date can't be after the analysis date (${input.analysisDate})`,
    };

  // While the date is still the pre-filled one, an unchanged price keeps its provider
  // quote and that quote's own date; classes can close on different days.
  const dateUntouched =
    input.priceDate === providerPriceDate(input.providerQuotes);
  const quotes: QuoteSnapshot[] = [];
  const errors: Record<string, string> = {};
  for (const [ticker, text] of entered) {
    const close = Number(text.replace(/[$,\s]/g, ""));
    const provided = input.providerQuotes.find(
      (q) =>
        q.symbol === ticker &&
        q.close === close &&
        (dateUntouched || q.asOfDate === input.priceDate),
    );
    if (provided) {
      quotes.push(provided);
      continue;
    }
    const r = userQuote({
      symbol: ticker,
      close,
      asOfDate: input.priceDate,
      analysisDate: input.analysisDate,
      retrievedAt: input.retrievedAt,
    });
    if (r.kind === "ok") quotes.push(r.quote);
    else errors[ticker] = r.message;
  }
  return { quotes, errors };
}

export interface CellDisplay {
  text: string;
  kind: "value" | "needs-price" | "nm" | "missing" | "unsupported";
  note?: string;
}

export function displayValuationCell(
  m: Metric,
  unit: "USD" | "multiple" | "USD/shares",
  needsPrice: readonly string[],
): CellDisplay {
  switch (m.status) {
    case "reported":
    case "derived":
      return {
        text:
          unit === "multiple"
            ? formatMultiple(m.value)
            : unit === "USD/shares"
              ? formatPerShare(m.value)
              : formatMillions(m.value),
        kind: "value",
      };
    case "nm":
      return {
        text: "NM",
        kind: "nm",
        note: `NM: ${NM_REASON_TEXT[m.reason]}${
          m.value === null ? "" : ` (${formatMultiple(m.value)})`
        }`,
      };
    case "missing":
      return needsPrice.length > 0
        ? { text: "Needs price", kind: "needs-price", note: m.reason }
        : { text: "—", kind: "missing", note: m.reason };
    case "unsupported":
      return {
        text: "Unsupported",
        kind: "unsupported",
        note: m.reason.message,
      };
  }
}

// Orders items by SEC's listing order (WSO before WSO-B), not XBRL member order.
export function byListingOrder<T>(
  identity: CompanyIdentity,
  items: readonly T[],
  tickerOf: (item: T) => string | undefined,
): T[] {
  const listed = identity.tickers.map((l) => l.ticker);
  const rank = (item: T) => {
    const t = tickerOf(item);
    return t !== undefined && listed.includes(t)
      ? listed.indexOf(t)
      : listed.length;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}
