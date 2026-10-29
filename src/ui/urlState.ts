// The workbench's state in the URL (M4b), so a whole analysis is shareable by link
// and nothing is stored on a server:
//   /c/LII?add=TT,WSO&remove=HAYW&px=LII:500,CARR:52.1,WSO-B:450&pxdate=2026-10-28
// add/remove are tickers; px is ticker:price per listed class; pxdate is the shared
// price date. Parsing is defensive: anything malformed is dropped, never guessed.
// Prices for removed peers stay in the URL but aren't applied.

import { isIsoDate } from "@/domain/dates";
import { PEERS } from "@/domain/policy";
import { PRICE_LIMIT } from "@/prices/userEntered";
import { TICKER_PATTERN } from "@/lib/ticker";

export interface WorkbenchUrlState {
  add: string[];
  remove: string[];
  prices: Record<string, string>; // ticker → price text, as typed
  priceDate?: string;
}

const MAX_PARAM_LENGTH = 2000; // a 12-peer, 2-class state is well under 400
const PRICE_TEXT = /^\d{1,7}(\.\d{1,6})?$/;

type Params = Pick<URLSearchParams, "get">;

function param(params: Params, name: string): string {
  const raw = params.get(name) ?? "";
  return raw.length > MAX_PARAM_LENGTH ? "" : raw;
}

function tickerList(raw: string, max: number): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim().toUpperCase();
    if (TICKER_PATTERN.test(t) && !out.includes(t)) out.push(t);
    if (out.length === max) break;
  }
  return out;
}

export function validPriceText(text: string): boolean {
  if (!PRICE_TEXT.test(text)) return false;
  const value = Number(text);
  return value > 0 && value < PRICE_LIMIT;
}

export function parseUrlState(params: Params): WorkbenchUrlState {
  const prices: Record<string, string> = {};
  for (const part of param(params, "px").split(",")) {
    const [rawTicker, text, extra] = part.split(":");
    const ticker = (rawTicker ?? "").trim().toUpperCase();
    if (extra !== undefined || !TICKER_PATTERN.test(ticker)) continue;
    if (text !== undefined && validPriceText(text.trim()))
      prices[ticker] = text.trim();
  }
  const date = param(params, "pxdate");
  return {
    add: tickerList(param(params, "add"), PEERS.max),
    // Removed peers can be any suggested peer; 12 more than covers them.
    remove: tickerList(param(params, "remove"), PEERS.max * 2),
    prices,
    ...(isIsoDate(date) ? { priceDate: date } : {}),
  };
}

// "?add=…&remove=…&px=…&pxdate=…", or "" for an empty state. Commas and colons stay
// readable; tickers and prices never need escaping once validated.
export function urlQuery(state: WorkbenchUrlState): string {
  const parts: string[] = [];
  if (state.add.length) parts.push(`add=${state.add.join(",")}`);
  if (state.remove.length) parts.push(`remove=${state.remove.join(",")}`);
  const px = Object.entries(state.prices)
    .filter(([t, p]) => TICKER_PATTERN.test(t) && validPriceText(p.trim()))
    .map(([t, p]) => `${t}:${p.trim()}`);
  if (px.length) parts.push(`px=${px.join(",")}`);
  if (state.priceDate && isIsoDate(state.priceDate))
    parts.push(`pxdate=${state.priceDate}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
