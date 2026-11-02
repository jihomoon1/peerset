// The workbench's state in the URL (M4b), so a whole analysis is shareable by link
// and nothing is stored on a server:
//   /c/LII?cik=0001069202&add=TT,WSO&remove=HAYW&px=LII:500,CARR:52.1,WSO-B:450&pxdate=2026-10-28
// cik (M6) is the target's CIK when the link was made, so a ticker that later maps to
// another company, or to none, is reported instead of silently remapped.
// add/remove are tickers; px is ticker:price per listed class; pxdate is the shared
// price date; pxav (v1.1) names the px prices the browser filled from Alpha Vantage
// with the user's own key, each with its bar's date (pxav=LII:2026-10-30). Never the
// key itself. Parsing is defensive: anything malformed is dropped, never guessed.
// Prices for removed peers stay in the URL but aren't applied.

import { isIsoDate } from "@/domain/dates";
import { PEERS } from "@/domain/policy";
import { PRICE_LIMIT } from "@/prices/userEntered";
import { TICKER_PATTERN } from "@/lib/ticker";

export interface WorkbenchUrlState {
  cik?: string; // 10 digits
  add: string[];
  remove: string[];
  prices: Record<string, string>; // ticker → price text, as typed
  priceDate?: string;
  filled?: Record<string, string>; // ticker → bar date, for px prices filled (v1.1)
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
  const cik = param(params, "cik");
  const filled: Record<string, string> = {};
  for (const part of param(params, "pxav").split(",")) {
    const [rawTicker, d, extra] = part.split(":");
    const ticker = (rawTicker ?? "").trim().toUpperCase();
    if (extra !== undefined || !(ticker in prices)) continue;
    if (d !== undefined && isIsoDate(d.trim())) filled[ticker] = d.trim();
  }
  return {
    ...(/^\d{10}$/.test(cik) ? { cik } : {}),
    add: tickerList(param(params, "add"), PEERS.max),
    // Removed peers can be any suggested peer; 12 more than covers them.
    remove: tickerList(param(params, "remove"), PEERS.max * 2),
    prices,
    ...(isIsoDate(date) ? { priceDate: date } : {}),
    ...(Object.keys(filled).length ? { filled } : {}),
  };
}

// "?cik=…&add=…&remove=…&px=…&pxdate=…&pxav=…", or "" for an empty state. Commas and colons stay
// readable; tickers and prices never need escaping once validated.
export function urlQuery(state: WorkbenchUrlState): string {
  const parts: string[] = [];
  if (state.cik && /^\d{10}$/.test(state.cik)) parts.push(`cik=${state.cik}`);
  if (state.add.length) parts.push(`add=${state.add.join(",")}`);
  if (state.remove.length) parts.push(`remove=${state.remove.join(",")}`);
  const px = Object.entries(state.prices)
    .filter(([t, p]) => TICKER_PATTERN.test(t) && validPriceText(p.trim()))
    .map(([t, p]) => `${t}:${p.trim()}`);
  if (px.length) parts.push(`px=${px.join(",")}`);
  if (state.priceDate && isIsoDate(state.priceDate))
    parts.push(`pxdate=${state.priceDate}`);
  const pxav = Object.entries(state.filled ?? {})
    .filter(
      ([t, d]) =>
        TICKER_PATTERN.test(t) &&
        isIsoDate(d) &&
        validPriceText((state.prices[t] ?? "").trim()),
    )
    .map(([t, d]) => `${t}:${d}`);
  if (pxav.length) parts.push(`pxav=${pxav.join(",")}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
