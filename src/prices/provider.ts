// The quote-provider seam (blueprint §9, §11). PRICE_PROVIDER=user is the default
// and production's setting until Alpha Vantage's written approval is filed in
// docs/licensing.md; alpha_vantage is for local development.

import type { QuoteSnapshot } from "@/domain/types";

export type { QuoteSnapshot };

export interface QuoteProvider {
  // One end-of-day close for a ticker, in SEC's spelling ('WSO-B').
  getQuote(symbol: string): Promise<QuoteSnapshot>;
}

export type PriceProviderName = "user" | "alpha_vantage";

// Anything other than exactly 'alpha_vantage' means user-entered prices.
export function priceProviderName(
  env: Record<string, string | undefined>,
): PriceProviderName {
  return env.PRICE_PROVIDER === "alpha_vantage" ? "alpha_vantage" : "user";
}
