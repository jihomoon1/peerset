// Ticker shape check shared by the server and the home-page search box. Pure and
// dependency-free, so the browser bundle can use it.

export const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/; // blueprint §13

export const TICKER_SHAPE_MESSAGE =
  "A ticker is 1–10 letters, digits, dots or dashes, starting with a letter";

export type TickerInput =
  { ok: true; ticker: string } | { ok: false; message: string };

export function parseTickerInput(raw: string): TickerInput {
  const ticker = raw.trim().toUpperCase();
  if (!ticker) return { ok: false, message: "Enter a ticker, for example LII" };
  if (!TICKER_PATTERN.test(ticker))
    return { ok: false, message: TICKER_SHAPE_MESSAGE };
  return { ok: true, ticker };
}
