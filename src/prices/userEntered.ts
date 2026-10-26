// User-entered prices (blueprint §9: the launch default). Pure, so the browser runs the
// same validation as the server (blueprint §13).

import { isIsoDate } from "@/domain/dates";
import type { QuoteSnapshot } from "@/domain/types";

export const PRICE_LIMIT = 1_000_000; // blueprint §13: prices above 0 and below this

export type UserQuoteResult =
  { kind: "ok"; quote: QuoteSnapshot } | { kind: "invalid"; message: string };

export function userQuote(input: {
  symbol: string;
  close: number;
  asOfDate: string;
  analysisDate: string;
  retrievedAt: string;
}): UserQuoteResult {
  const { close, asOfDate, analysisDate } = input;
  const invalid = (message: string): UserQuoteResult => ({
    kind: "invalid",
    message,
  });
  if (!Number.isFinite(close)) return invalid("Price must be a number");
  if (close <= 0) return invalid("Price must be above 0");
  if (close >= PRICE_LIMIT) return invalid("Price must be below 1,000,000");
  if (!isIsoDate(asOfDate))
    return invalid("Price date must be a real date (YYYY-MM-DD)");
  if (asOfDate > analysisDate)
    return invalid(
      `Price date can't be after the analysis date (${analysisDate})`,
    );
  return {
    kind: "ok",
    quote: {
      symbol: input.symbol.trim().toUpperCase(),
      close,
      currency: "USD",
      asOfDate,
      source: "user_entered",
      retrievedAt: input.retrievedAt,
    },
  };
}
