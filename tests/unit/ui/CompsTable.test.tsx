import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildComps, type CompsPeer } from "@/domain/comps";
import type { QuoteSnapshot } from "@/domain/types";
import type { PeersResponse } from "@/lib/peers";
import { CompsTable } from "@/ui/CompsTable";
import { PeerPanel, tierText } from "@/ui/PeerPanel";
import { StatsDrawer } from "@/ui/StatsDrawer";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// Blueprint §6 comps table and peer panel, rendered to static HTML from the fixtures.

const [lii, carr, aaon, ggg, jci] = await Promise.all([
  fixtureFundamentals("LII"),
  fixtureFundamentals("CARR"),
  fixtureFundamentals("AAON"),
  fixtureFundamentals("GGG"),
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
  reason: "test",
  state: { kind: "loaded", fundamentals: f },
});

function render(peers: CompsPeer[], quotes: QuoteSnapshot[] = []) {
  const table = buildComps(lii, peers, quotes, "2026-10-26");
  return renderToStaticMarkup(
    <CompsTable table={table} inputs={{}} errors={{}} onInput={() => {}} />,
  );
}

describe("CompsTable", () => {
  const html = render(
    [
      loaded("CARR", carr),
      loaded("JCI", jci),
      loaded("GGG", ggg),
      {
        ticker: "AAON",
        origin: "suggested",
        reason: "t",
        state: { kind: "loading" },
      },
      {
        ticker: "HAYW",
        origin: "suggested",
        reason: "t",
        state: {
          kind: "failed",
          code: "SEC_UNAVAILABLE",
          message: "SEC is unavailable",
        },
      },
    ],
    [quote("LII", 500), quote("CARR", 60), quote("JCI", 80)],
  );

  it("is a real table with column headers in blueprint §6 order", () => {
    expect(html).toContain("<caption");
    const order = [
      "Company",
      "Ticker",
      "Fin. through",
      "Price (USD)",
      "Market cap",
      "EV",
      "LTM revenue",
      "LTM EBITDA",
      "EBITDA margin",
      "EV/Revenue",
      "EV/EBITDA",
      "P/E",
    ].map((h) => html.indexOf(`>${h}<`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("pins the target first with a Target tag", () => {
    const body = html.slice(html.indexOf("<tbody"));
    expect(body.indexOf("LENNOX")).toBeLessThan(body.indexOf("CARRIER"));
    expect(html).toContain(">Target<");
  });

  it("gives each peer one labelled price input per listed class", () => {
    expect(html).toContain('aria-label="CARR price (USD)"');
    expect(html).not.toContain('aria-label="LII price (USD)"'); // in the valuation block
  });

  it("shows JCI's EBITDA as Unsupported with the reason in its label", () => {
    expect(html).toMatch(
      /aria-label="JCI LTM EBITDA: Unsupported \(EBITDA needs operating income/,
    );
  });

  it("flags GGG's lag in Fin. through", () => {
    expect(html).toMatch(
      /Lagging: LTM ends 2026-09-25, 87 days from the peer median/,
    );
  });

  it("marks values parsed from the filing", () => {
    expect(html).toContain("(parsed from filing)");
  });

  it("shows a loading row as busy and a failed row greyed with its status", () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading AAON");
    expect(html).toMatch(
      /Failed to load(<!-- -->)?: (<!-- -->)?SEC is unavailable(<!-- -->)? — excluded from statistics/,
    );
  });

  it("lists the statistics rows below the peers", () => {
    for (const label of [
      "Mean",
      "Median",
      "High",
      "Low",
      "25th percentile",
      "75th percentile",
      "n",
    ])
      expect(html).toContain(`>${label}</th>`);
    // EV/EBITDA: CARR and GGG? GGG has no price, so only CARR is valid; JCI is
    // Unsupported, GGG needs a price, HAYW failed: 3 left out.
    expect(html).toMatch(/aria-label="n EV\/EBITDA: 1 \(3 excl\.\)/);
  });
});

const selection = (over: Partial<PeersResponse>): PeersResponse => ({
  target: {
    cik: "0001069202",
    ticker: "LII",
    name: "LENNOX INTERNATIONAL INC",
    sic: "3585",
    sicDescription: "",
    screeningRevenue: 5_195_300_000,
    screeningRevenuePeriodEnd: "2025-12-31",
  },
  analysisDate: "2026-10-26",
  tier: "sic3",
  funnel: [],
  selected: [
    {
      cik: "1",
      ticker: "MIDD",
      reason: "SIC 3580 · 3-digit group 358 · revenue 0.6x",
    },
  ],
  excluded: [
    {
      cik: "2",
      ticker: "SXI",
      code: "OUTSIDE_SIZE_RANGE",
      detail: "revenue 0.19x the target's (allowed 0.2x–5x)",
    },
  ],
  indexGeneratedAt: "2026-10-29T04:35:31Z",
  ...over,
});

const panel = (
  data: PeersResponse,
  extra: Partial<Parameters<typeof PeerPanel>[0]> = {},
) =>
  renderToStaticMarkup(
    <PeerPanel
      selection={{ ok: true, data }}
      active={data.selected.map((p) => ({
        ticker: p.ticker,
        origin: "suggested",
        reason: p.reason,
      }))}
      removed={[]}
      states={{}}
      notAPeer={[]}
      onAdd={() => null}
      onRemove={() => {}}
      onRestore={() => {}}
      onDismiss={() => {}}
      {...extra}
    />,
  );

describe("PeerPanel", () => {
  it("says SIC matches and names the tier, never 'the peers'", () => {
    const html = panel(selection({}));
    expect(html).toContain(">SIC matches<");
    expect(html).toContain("3-digit group 358 — fewer than 5 exact matches");
    expect(html.toLowerCase()).not.toContain("the peers");
  });

  it("names each tier", () => {
    expect(tierText(selection({ tier: "sic4" }))).toBe("SIC 3585 exact");
    expect(tierText(selection({ tier: "sic2" }))).toBe(
      "2-digit group 35 — fewer than 5 in group 358",
    );
  });

  it("puts the add box first and lists every exclusion with its code", () => {
    const html = panel(selection({}));
    expect(html.indexOf("Add a ticker")).toBeLessThan(
      html.indexOf("SIC matches"),
    );
    expect(html).toContain("OUTSIDE_SIZE_RANGE");
    expect(html).toContain("revenue 0.19x the target");
  });

  it("lists a peer that failed to load under Excluded", () => {
    const html = panel(selection({}), {
      states: {
        MIDD: {
          kind: "failed",
          code: "SEC_UNAVAILABLE",
          message: "SEC is unavailable",
        },
      },
    });
    const excluded = html.slice(html.indexOf("excluded-heading"));
    expect(excluded).toContain("SEC_UNAVAILABLE");
  });

  it("all peers filtered out: says so, with the counts dropped at each filter", () => {
    const html = panel(
      selection({
        tier: "sic2",
        selected: [],
        funnel: [
          {
            tier: "sic4",
            group: "3561",
            companies: 2,
            dropped: { OUTSIDE_SIZE_RANGE: 2 },
            qualified: 0,
          },
          {
            tier: "sic3",
            group: "356",
            companies: 2,
            dropped: { OUTSIDE_SIZE_RANGE: 2 },
            qualified: 0,
          },
          {
            tier: "sic2",
            group: "35",
            companies: 9,
            dropped: { OUTSIDE_SIZE_RANGE: 7, FOREIGN_FILER: 2 },
            qualified: 0,
          },
        ],
      }),
    );
    expect(html).toContain("No peers passed the screen.");
    expect(html).toContain(
      "2-digit group 35: 9 companies; dropped 7 revenue outside 0.2x–5x, 2 files 20-F or 40-F; 0 qualified",
    );
    expect(html).toContain("Add a ticker");
  });

  it("shows an added ticker that isn't a company next to the add box", () => {
    const html = panel(selection({}), {
      notAPeer: [
        { ticker: "ZZZZZ", message: "No SEC-registered company uses ZZZZZ" },
      ],
    });
    expect(html).toMatch(
      /ZZZZZ(<!-- -->)? can&#x27;t be added: (<!-- -->)?No SEC-registered company uses ZZZZZ/,
    );
  });
});

describe("StatsDrawer", () => {
  it("lists the values used and those left out, with reasons", () => {
    const table = buildComps(
      lii,
      [loaded("CARR", carr), loaded("JCI", jci), loaded("AAON", aaon)],
      [],
      "2026-10-26",
    );
    const html = renderToStaticMarkup(
      <StatsDrawer
        label="LTM EBITDA"
        unit="USD"
        stat="median"
        stats={table.stats.ebitda}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Median: LTM EBITDA");
    expect(html).toContain(">CARR<");
    expect(html).toContain(">AAON<");
    expect(html).toMatch(/JCI<\/span>:.*Unsupported/);
    expect(html).not.toContain(">LII<");
  });
});
