import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildComps, type CompsPeer } from "@/domain/comps";
import type { QuoteSnapshot } from "@/domain/types";
import { ImpliedValuationBlock } from "@/ui/ImpliedValuationBlock";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// Implied valuation block (methodology §13), from the comps golden's set-up.

const [lii, carr, aaon, jci] = await Promise.all([
  fixtureFundamentals("LII"),
  fixtureFundamentals("CARR"),
  fixtureFundamentals("AAON"),
  fixtureFundamentals("JCI"),
]);
const quote = (symbol: string, close: number): QuoteSnapshot => ({
  symbol,
  close,
  currency: "USD",
  asOfDate: "2026-10-23",
  source: "user_entered",
  retrievedAt: "2026-10-26T12:00:00Z",
});
const loaded = (ticker: string, f: typeof lii): CompsPeer => ({
  ticker,
  origin: "suggested",
  reason: "t",
  state: { kind: "loaded", fundamentals: f },
});
const render = (quotes: QuoteSnapshot[]) =>
  renderToStaticMarkup(
    <ImpliedValuationBlock
      table={buildComps(
        lii,
        [loaded("CARR", carr), loaded("AAON", aaon), loaded("JCI", jci)],
        quotes,
        "2026-10-26",
      )}
    />,
  );

describe("ImpliedValuationBlock", () => {
  it("shows implied prices at the 25th, median and 75th percentile", () => {
    const html = render([
      quote("CARR", 60),
      quote("AAON", 100),
      quote("JCI", 80),
    ]);
    expect(html).toContain("Implied valuation");
    for (const h of ["25th percentile", "Median", "75th percentile"])
      expect(html).toContain(`>${h}<`);
    // EV/EBITDA from CARR (19.98x) and AAON (29.08x): median 24.53x.
    // 1,164.9M × 24.5300 = 28,574.9M EV; − 1,581.3M + 52.1M = 27,045.7M equity;
    // ÷ 34,560,675 shares = 782.56.
    expect(html).toMatch(/EV\/EBITDA/);
    expect(html).toContain(">782.56<");
    expect(html).toMatch(/1,164\.9(<!-- -->)? × (<!-- -->)?24\.5300x/);
    expect(html).toContain("not a price target");
  });

  it("without peer prices, says why instead of showing a number", () => {
    const html = render([]);
    expect(html).toContain("no peer has a valid EV/EBITDA");
    expect(html).not.toMatch(/>0\.00</);
  });
});
