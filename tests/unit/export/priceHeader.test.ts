import { describe, expect, it } from "vitest";
import type { QuoteSnapshot } from "@/domain/types";
import { priceHeader, QUOTE_SOURCE_WORDS } from "@/export/workbook";

// Workbook row 5 and the Sources sheet (v1.1, docs/licensing.md rule 5): prices
// filled with the user's own Alpha Vantage key carry their attribution.

const q = (
  symbol: string,
  source: QuoteSnapshot["source"],
  asOfDate = "2026-10-23",
): QuoteSnapshot => ({
  symbol,
  close: 100,
  currency: "USD",
  asOfDate,
  source,
  retrievedAt: "2026-10-26T14:00:00Z",
});

describe("priceHeader", () => {
  it("without prices", () => {
    expect(priceHeader([], null)).toBe(
      "Prices: none entered · valuation cells show —",
    );
  });

  it("typed prices only (unchanged from v1.0)", () => {
    expect(priceHeader([q("LII", "user_entered")], "2026-10-23")).toBe(
      "Prices as of 2026-10-23 · source: entered by user",
    );
  });

  it("every price filled with the user's key", () => {
    expect(
      priceHeader(
        [
          q("LII", "alpha_vantage_user_key"),
          q("WSO", "alpha_vantage_user_key", "2026-10-22"),
        ],
        "2026-10-22",
      ),
    ).toBe(
      "Prices: Alpha Vantage via the user's own key, close of 2026-10-22; entered by the user's browser.",
    );
  });

  it("a mix of filled and typed prices", () => {
    expect(
      priceHeader(
        [q("LII", "alpha_vantage_user_key"), q("WSO", "user_entered")],
        "2026-10-23",
      ),
    ).toBe(
      "Prices: Alpha Vantage via the user's own key (1) and entered by the user (1), earliest close 2026-10-23; entered by the user's browser.",
    );
  });

  it("names every source in the Sources sheet", () => {
    expect(QUOTE_SOURCE_WORDS.alpha_vantage_user_key).toBe(
      "Alpha Vantage via the user's own key",
    );
  });
});
