import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import type { QuoteSnapshot } from "@/domain/types";
import { priceCompany } from "@/domain/valuation";
import { CompanyWorkspace } from "@/ui/CompanyWorkspace";
import { EvBridgeDrawer } from "@/ui/EvBridgeDrawer";
import { ValuationBlock } from "@/ui/ValuationBlock";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// Blueprint §6: the valuation block's states and the EV bridge, rendered to static
// HTML from the fixtures (no browser needed).

const lii = await fixtureFundamentals("LII");
const wso = await fixtureFundamentals("WSO");
const PULLED = "2026-10-26T15:30:00.000Z";

const quote = (symbol: string, close: number): QuoteSnapshot => ({
  symbol,
  close,
  currency: "USD",
  asOfDate: "2026-10-23",
  source: "user_entered",
  retrievedAt: PULLED,
});

const workspace = (
  f: CompanyFundamentals,
  providerQuotes: QuoteSnapshot[] = [],
  providerOn = false,
) =>
  renderToStaticMarkup(
    <CompanyWorkspace
      f={f}
      pulledAt={PULLED}
      analysisDate="2026-10-26"
      providerQuotes={providerQuotes}
      providerErrors={[]}
      providerOn={providerOn}
    />,
  );

function block(f: CompanyFundamentals, quotes: QuoteSnapshot[]) {
  const tickers = f.shareClasses.classes.map((c) => c.ticker!);
  return renderToStaticMarkup(
    <ValuationBlock
      f={f}
      v={priceCompany(f, quotes, "2026-10-26")}
      tickers={tickers}
      inputs={Object.fromEntries(
        quotes.map((q) => [q.symbol, String(q.close)]),
      )}
      errors={{}}
      priceDate="2026-10-23"
      analysisDate="2026-10-26"
      providerErrors={[]}
      onInput={() => {}}
      onDate={() => {}}
      onPaste={() => []}
    />,
  );
}

describe("before any price", () => {
  it("LII: one labeled price input, and every valuation cell says Needs price", () => {
    const html = workspace(lii);
    expect(html).toContain('<label for="price-LII"');
    expect(html).toContain("LII price (USD)");
    expect(html).toContain('<label for="price-date"');
    expect(html).toContain('<label for="price-paste"');
    expect(html.match(/>Needs price</g)).toHaveLength(5);
  });

  it("the as-of strip shows prices needed, LTM end, cover date and pull time", () => {
    const html = workspace(lii);
    expect(html).toContain("needs a price");
    expect(html).toContain("June 30, 2026");
    expect(html).toContain("July 22, 2026");
    expect(html).toContain("October 26, 2026, 15:30 UTC");
    expect(html).not.toContain("Alpha Vantage");
  });

  it("WSO: two price inputs, one per listed class", () => {
    const html = workspace(wso);
    expect(html).toContain("WSO price (USD)");
    expect(html).toContain("WSO-B price (USD)");
    expect(html).toContain("August 4, 2026");
  });
});

describe("priced", () => {
  it("LII at 500.00: market cap, EV and the three multiples", () => {
    const html = block(lii, [quote("LII", 500)]);
    expect(html).toContain("17,280.3");
    expect(html).toContain("18,809.5");
    expect(html).toContain("3.5x");
    expect(html).toContain("16.1x");
    expect(html).toContain("22.2x");
    expect(html).not.toContain("Needs price</");
  });

  it("WSO at 450.00 / 450.00: P/E Unsupported with the reason", () => {
    const html = block(wso, [quote("WSO", 450), quote("WSO-B", 450)]);
    expect(html).toContain("18,563.5");
    expect(html).toContain("18,108.4");
    expect(html).toContain("Unsupported");
    expect(html).toContain("P/E is computed for single-class companies only");
  });

  it("an NM cell shows NM with the reason as a tooltip and to screen readers", () => {
    const html = block(lii, [quote("LII", 2_300)]); // 2,300 ÷ 22.51 = 102.2x
    expect(html).toContain('title="NM: above 100x policy (102.2x)"');
    expect(html).toContain(
      '<span class="sr-only"> (NM: above 100x policy (102.2x))</span>',
    );
  });

  it("Alpha Vantage pre-fills are shown with their source and attribution", () => {
    const av = { ...quote("LII", 376.01), source: "alpha_vantage" as const };
    const html = workspace(lii, [av], true);
    expect(html).toContain('value="376.01"');
    expect(html).toContain("October 23, 2026");
    expect(html).toContain("Alpha Vantage close");
    expect(html).toContain("Price data provided by");
  });
});

describe("EvBridgeDrawer", () => {
  it("WSO: market cap by class, every debt and cash line, not-in-EV items, dates", () => {
    const v = priceCompany(
      wso,
      [quote("WSO", 450), quote("WSO-B", 450)],
      "2026-10-26",
    );
    const html = renderToStaticMarkup(
      <EvBridgeDrawer f={wso} v={v} onClose={() => {}} />,
    );
    for (const text of [
      "Enterprise value bridge",
      "18,108.4",
      "WSO-B",
      "5,663,438",
      "35,588,756",
      "450.00",
      "Current portion of lease liabilities",
      "Finance lease liabilities, net of current portion",
      "Short-term cash investments",
      "Noncontrolling interest",
      "478.8 USD m",
      "Prices as of",
      "October 23, 2026",
      "June 30, 2026",
      "August 4, 2026",
      "W_LEASE_LINE_EXCLUDED",
    ])
      expect(html, text).toContain(text);
  });
});
