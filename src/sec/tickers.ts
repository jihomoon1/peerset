// Ticker → CIK from SEC's company_tickers_exchange.json. Input is uppercased, then must
// match a listed ticker exactly: an unknown ticker is refused, never remapped (blueprint §3).

import { TickerNotFoundError } from "@/lib/errors";
import type { Listing } from "@/domain/types";
import { CompanyTickersExchangeSchema, parseOrThrow } from "./schemas";
import { padCik } from "./urls";

export const TICKER_LIST_URL =
  "https://www.sec.gov/files/company_tickers_exchange.json";

export const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/; // blueprint §13

interface TickerRow {
  cik: string;
  name: string;
  ticker: string;
  exchange: string;
}

export interface TickerTable {
  byTicker: Map<string, TickerRow>;
  byCik: Map<string, TickerRow[]>;
}

export interface TickerMatch {
  cik: string;
  name: string;
  listings: Listing[]; // every row SEC lists for this CIK, in SEC's order
}

export function parseTickerTable(raw: unknown): TickerTable {
  const { data } = parseOrThrow(
    CompanyTickersExchangeSchema,
    raw,
    "company_tickers_exchange",
  );
  const byTicker = new Map<string, TickerRow>();
  const byCik = new Map<string, TickerRow[]>();
  for (const [cikNumber, name, ticker, exchange] of data) {
    const row = {
      cik: padCik(cikNumber),
      name,
      ticker,
      exchange: exchange ?? "",
    };
    byTicker.set(ticker, row);
    const rows = byCik.get(row.cik) ?? [];
    rows.push(row);
    byCik.set(row.cik, rows);
  }
  return { byTicker, byCik };
}

export function lookupTicker(table: TickerTable, input: string): TickerMatch {
  const ticker = input.toUpperCase();
  if (!TICKER_PATTERN.test(ticker))
    throw new TickerNotFoundError(input.slice(0, 12), "malformed ticker");
  const row = table.byTicker.get(ticker);
  if (!row) throw new TickerNotFoundError(ticker);
  const listings = (table.byCik.get(row.cik) ?? [row]).map((r) => ({
    ticker: r.ticker,
    exchange: r.exchange,
  }));
  return { cik: row.cik, name: row.name, listings };
}
