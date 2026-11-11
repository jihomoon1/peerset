import { describe, expect, it } from "vitest";
import type { PeerIndex, PeerIndexCompany } from "@/peers/indexTypes";
import { exclusionFor, findTarget, screenPeers } from "@/peers/screen";
import { TickerNotFoundError, UnsupportedIssuerError } from "@/lib/errors";

// A synthetic index. Revenues are round numbers so each ratio is easy to check by
// hand: the target has 1,000 (USD m), so 0.2x–5x is 200–5,000.

const DAY = "2026-10-28"; // analysis date, injected

let n = 0;
function co(
  ticker: string,
  sic: string,
  revenueM: number | null,
  over: Partial<PeerIndexCompany> = {},
): PeerIndexCompany {
  n++;
  return {
    cik: String(n).padStart(10, "0"),
    name: `${ticker} Corp`,
    ticker,
    listings: [{ ticker, exchange: "NYSE" }],
    sic,
    sicDescription: "",
    fiscalYearEnd: "1231",
    incorporation: "DE",
    latest: {
      form: "10-Q",
      filedDate: "2026-07-29",
      reportDate: "2026-06-30",
      accession: `0000000000-26-${String(n).padStart(6, "0")}`,
    },
    files20F: false,
    revenue:
      revenueM === null
        ? null
        : {
            value: revenueM * 1_000_000,
            periodEnd: "2025-12-31",
            concept: "us-gaap:Revenues",
            accession: "0000000000-26-000000",
          },
    revenueNote:
      revenueM === null ? "no fiscal-year revenue in a 10-K or 10-K/A" : null,
    kind: Number(sic) >= 6000 && Number(sic) <= 6799 ? null : "operating",
    totalAssets: null,
    ...over,
  };
}

function index(companies: PeerIndexCompany[], unlisted = []): PeerIndex {
  return {
    meta: {
      generatedAt: "2026-11-01T06:30:00Z",
      methodologyVersion: "0.3.2",
      sources: {
        tickers: { url: "t", lastModified: "x" },
        submissions: { url: "s", lastModified: "x" },
        companyfacts: { url: "c", lastModified: "x" },
      },
      counts: {
        total: 0,
        listed: 0,
        withRevenue: 0,
        byExclusionReason: {},
        unreadable: { submissions: 0, companyfacts: 0 },
      },
    },
    companies: [...companies].sort((a, b) => a.cik.localeCompare(b.cik)),
    unlisted,
    kindsRecorded: true,
  };
}

const tickers = (r: { ticker: string }[]) => r.map((x) => x.ticker);

describe("exclusionFor (blueprint §10.2 step 2)", () => {
  it("accepts a current 10-K or 10-Q filer with revenue", () => {
    expect(exclusionFor(co("OK", "3585", 1_000), DAY)).toBeNull();
    expect(
      exclusionFor(
        co("OKA", "3585", 1_000, {
          latest: {
            form: "10-K/A",
            filedDate: "2026-09-01",
            reportDate: "2025-12-31",
            accession: "a",
          },
        }),
        DAY,
      ),
    ).toBeNull();
  });

  it.each([
    ["NO_PERIODIC_FILING", { latest: null }],
    [
      "FOREIGN_FILER",
      {
        files20F: true,
        latest: {
          form: "20-F",
          filedDate: "2026-04-01",
          reportDate: "2025-12-31",
          accession: "a",
        },
      },
    ],
    [
      "TRANSITION_PERIOD",
      {
        latest: {
          form: "10-KT",
          filedDate: "2026-09-01",
          reportDate: "2026-06-30",
          accession: "a",
        },
      },
    ],
    ["FINANCIAL_SIC", { sic: "6021" }],
    [
      "NO_SCREENING_REVENUE",
      { revenue: null, revenueNote: "no fiscal-year revenue" },
    ],
  ] as const)("%s", (code, over) => {
    const r = exclusionFor(
      co("X", "3585", 1_000, over as Partial<PeerIndexCompany>),
      DAY,
    );
    expect(r?.code).toBe(code);
    expect(r?.detail).toBeTruthy();
  });

  it("screening revenue must end within 15 months of the latest report", () => {
    const withFy = (periodEnd: string) =>
      co("R", "3585", 1_000, {
        revenue: {
          value: 1e9,
          periodEnd,
          concept: "us-gaap:Revenues",
          accession: "a",
        },
      }); // latest report 2026-06-30, so the limit is 2025-03-30
    expect(exclusionFor(withFy("2025-03-30"), DAY)).toBeNull();
    expect(exclusionFor(withFy("2025-03-29"), DAY)).toEqual({
      code: "NO_SCREENING_REVENUE",
      detail:
        "screening revenue is for the fiscal year ended 2025-03-29, more than 15 months before the latest report (2026-06-30)",
    });
  });

  it("financial SICs run 6000 to 6799 inclusive", () => {
    expect(exclusionFor(co("A", "5999", 1), DAY)).toBeNull();
    expect(exclusionFor(co("B", "6000", 1), DAY)?.code).toBe("FINANCIAL_SIC");
    expect(exclusionFor(co("C", "6799", 1), DAY)?.code).toBe("FINANCIAL_SIC");
    expect(exclusionFor(co("D", "6800", 1), DAY)).toBeNull();
  });

  it("a filing 200 days old is current; 201 days is stale", () => {
    const filed = (filedDate: string) =>
      co("S", "3585", 1, {
        latest: {
          form: "10-Q",
          filedDate,
          reportDate: "2026-03-31",
          accession: "a",
        },
      });
    expect(exclusionFor(filed("2026-04-11"), DAY)).toBeNull(); // 200 days
    expect(exclusionFor(filed("2026-04-10"), DAY)).toMatchObject({
      code: "STALE_FILING",
      detail: "latest 10-Q filed 2026-04-10, 201 days before 2026-10-28",
    });
  });
});

describe("screenPeers", () => {
  it("keeps the same 4-digit SIC when at least 5 peers qualify, with reasons", () => {
    const target = co("TGT", "3585", 1_000);
    const peers = [
      co("AAA", "3585", 600),
      co("BBB", "3585", 1_500),
      co("CCC", "3585", 2_000),
      co("DDD", "3585", 400),
      co("EEE", "3585", 3_000),
      co("NEAR", "3580", 1_000), // a 3-digit match, not used in the sic4 tier
    ];
    const r = screenPeers(index([target, ...peers]), target, {
      analysisDate: DAY,
    });
    expect(r.tier).toBe("sic4");
    expect(tickers(r.selected)).not.toContain("NEAR");
    expect(r.selected.find((p) => p.ticker === "AAA")?.reason).toBe(
      "SIC 3585 exact · revenue 0.6x · Dec FYE · 10-Q filed 2026-07-29",
    );
    expect(r.indexGeneratedAt).toBe("2026-11-01T06:30:00Z");
  });

  it("ranks by closeness of scale, |ln(peer ÷ target)|, ties by ticker A–Z", () => {
    const target = co("TGT", "3585", 1_000);
    const peers = [
      co("ZZ", "3585", 2_000), // |ln 2|
      co("YY", "3585", 500), // |ln 0.5| = |ln 2|: tie, broken by ticker
      co("MM", "3585", 1_100),
      co("KK", "3585", 4_000),
      co("JJ", "3585", 300),
    ];
    const r = screenPeers(index([target, ...peers]), target, {
      analysisDate: DAY,
    });
    expect(tickers(r.selected)).toEqual(["MM", "YY", "ZZ", "JJ", "KK"]);
  });

  it("keeps 0.2x and 5x and drops just outside them", () => {
    const target = co("TGT", "3585", 1_000);
    const peers = [
      co("LOW", "3585", 200),
      co("HIGH", "3585", 5_000),
      co("TOOLOW", "3585", 199),
      co("TOOHIGH", "3585", 5_001),
      co("P1", "3585", 900),
      co("P2", "3585", 1_100),
      co("P3", "3585", 1_200),
    ];
    const r = screenPeers(index([target, ...peers]), target, {
      analysisDate: DAY,
    });
    expect(tickers(r.selected)).toEqual(
      expect.arrayContaining(["LOW", "HIGH"]),
    );
    const out = r.excluded.filter((e) => e.code === "OUTSIDE_SIZE_RANGE");
    expect(tickers(out).sort()).toEqual(["TOOHIGH", "TOOLOW"]);
    expect(out.find((e) => e.ticker === "TOOHIGH")?.detail).toBe(
      "revenue >5.00x the target's (allowed 0.2x–5x)",
    );
    expect(out.find((e) => e.ticker === "TOOLOW")?.detail).toBe(
      "revenue <0.20x the target's (allowed 0.2x–5x)",
    );
  });

  it("widens to the 3-digit group, then the 2-digit major group, when fewer than 5 qualify", () => {
    const target = co("TGT", "3585", 1_000);
    const sic4 = [co("A4", "3585", 900), co("B4", "3585", 1_100)];
    const sic3 = [co("A3", "3580", 950), co("B3", "3589", 1_050)];
    const sic2 = [co("A2", "3561", 1_000), co("B2", "3714", 1_000)];
    // Out of size in sic4: still not enough to stay at sic4.
    const big = [
      co("BIG1", "3585", 9_000),
      co("BIG2", "3585", 9_000),
      co("BIG3", "3585", 9_000),
    ];

    const at3 = screenPeers(
      index([target, ...sic4, ...big, ...sic3, co("C3", "3581", 800)]),
      target,
      { analysisDate: DAY },
    );
    expect(at3.tier).toBe("sic3");
    expect(at3.selected.find((p) => p.ticker === "A3")?.reason).toMatch(
      /^SIC 3580 · 3-digit group 358 · /,
    );

    const at2 = screenPeers(
      index([target, ...sic4, ...sic3, ...sic2]),
      target,
      {
        analysisDate: DAY,
      },
    );
    expect(at2.tier).toBe("sic2");
    expect(tickers(at2.selected)).toContain("A2");
    expect(tickers(at2.selected)).not.toContain("B2"); // SIC 37xx
    expect(at2.selected.find((p) => p.ticker === "A2")?.reason).toMatch(
      /^SIC 3561 · 2-digit group 35 · /,
    );
  });

  it("stays at the 2-digit group even with fewer than 5", () => {
    const target = co("TGT", "3585", 1_000);
    const r = screenPeers(index([target, co("ONLY", "3500", 1_000)]), target, {
      analysisDate: DAY,
    });
    expect(r.tier).toBe("sic2");
    expect(tickers(r.selected)).toEqual(["ONLY"]);
  });

  it("each selected peer names its latest filing, for the loading line (M6)", () => {
    const target = co("TGT", "3585", 1_000);
    const r = screenPeers(index([target, co("ONLY", "3500", 1_000)]), target, {
      analysisDate: DAY,
    });
    expect(r.selected[0].latest).toEqual({
      form: "10-Q",
      filedDate: "2026-07-29",
    });
  });

  it("selects 8 by default, and the caller may keep 5 to 12", () => {
    const target = co("TGT", "3585", 1_000);
    const peers = Array.from({ length: 14 }, (_, i) =>
      co(`P${String(i).padStart(2, "0")}`, "3585", 500 + i * 50),
    );
    const idx = index([target, ...peers]);
    expect(
      screenPeers(idx, target, { analysisDate: DAY }).selected,
    ).toHaveLength(8);
    expect(
      screenPeers(idx, target, { analysisDate: DAY, count: 5 }).selected,
    ).toHaveLength(5);
    const twelve = screenPeers(idx, target, { analysisDate: DAY, count: 12 });
    expect(twelve.selected).toHaveLength(12);
    expect(
      twelve.excluded.filter((e) => e.code === "NOT_IN_TOP_N"),
    ).toHaveLength(2);
    expect(() =>
      screenPeers(idx, target, { analysisDate: DAY, count: 4 }),
    ).toThrow(/5.*12/);
    expect(() =>
      screenPeers(idx, target, { analysisDate: DAY, count: 13 }),
    ).toThrow(/5.*12/);
  });

  it("lists each ineligible company in the tier with its code, never the target", () => {
    const target = co("TGT", "3585", 1_000);
    const peers = [
      co("P1", "3585", 900),
      co("P2", "3585", 1_100),
      co("P3", "3585", 1_200),
      co("P4", "3585", 800),
      co("P5", "3585", 700),
      co("FOR", "3585", 1_000, {
        files20F: true,
        latest: {
          form: "20-F",
          filedDate: "2026-04-01",
          reportDate: "2025-12-31",
          accession: "a",
        },
      }),
      co("NOREV", "3585", null),
      co("OLD", "3585", 1_000, {
        latest: {
          form: "10-K",
          filedDate: "2025-03-01",
          reportDate: "2024-12-31",
          accession: "a",
        },
      }),
    ];
    const r = screenPeers(index([target, ...peers]), target, {
      analysisDate: DAY,
    });
    const codes = Object.fromEntries(r.excluded.map((e) => [e.ticker, e.code]));
    expect(codes).toEqual({
      FOR: "FOREIGN_FILER",
      NOREV: "NO_SCREENING_REVENUE",
      OLD: "STALE_FILING",
    });
    expect([...tickers(r.selected), ...tickers(r.excluded)]).not.toContain(
      "TGT",
    );
    expect(new Set(r.selected.map((p) => p.cik)).size).toBe(r.selected.length);
  });
});

describe("screenPeers ordering and wording", () => {
  it("breaks ties by plain character order, independent of locale", () => {
    const target = co("TGT", "3585", 1_000);
    // Same revenue, so the same distance: "." (46) sorts before "A" (65).
    const peers = ["BFA", "BF.B", "P1", "P2", "P3"].map((t) =>
      co(t, "3585", 1_000),
    );
    const r = screenPeers(index([target, ...peers]), target, {
      analysisDate: DAY,
    });
    expect(tickers(r.selected)).toEqual(["BF.B", "BFA", "P1", "P2", "P3"]);
  });

  it("shows a tiny nonzero ratio as <0.1x, never 0.0x", () => {
    const target = co("TGT", "3585", 1_000);
    const peers = [
      co("TINY", "3585", 30),
      ...["P1", "P2", "P3", "P4", "P5"].map((t) => co(t, "3585", 1_000)),
    ];
    const r = screenPeers(index([target, ...peers]), target, {
      analysisDate: DAY,
    });
    expect(r.excluded.find((e) => e.ticker === "TINY")?.detail).toBe(
      "revenue <0.1x the target's (allowed 0.2x–5x)",
    );
  });
});

describe("screenPeers funnel (the 'all peers filtered out' state)", () => {
  it("counts, per tier tried, the companies in the group, those dropped by each filter and those that qualified", () => {
    const target = co("TGT", "3585", 1_000);
    const r = screenPeers(
      index([
        target,
        co("A4", "3585", 900),
        co("BIG", "3585", 9_000),
        co("BANKISH", "3585", null),
        co("A3", "3580", 950),
        co("FAR", "3714", 50),
      ]),
      target,
      { analysisDate: DAY },
    );
    expect(r.tier).toBe("sic2");
    expect(r.funnel).toEqual([
      {
        tier: "sic4",
        group: "3585",
        companies: 3,
        dropped: { OUTSIDE_SIZE_RANGE: 1, NO_SCREENING_REVENUE: 1 },
        qualified: 1,
      },
      {
        tier: "sic3",
        group: "358",
        companies: 4,
        dropped: { OUTSIDE_SIZE_RANGE: 1, NO_SCREENING_REVENUE: 1 },
        qualified: 2,
      },
      {
        tier: "sic2",
        group: "35",
        companies: 4,
        dropped: { OUTSIDE_SIZE_RANGE: 1, NO_SCREENING_REVENUE: 1 },
        qualified: 2,
      },
    ]);
  });

  it("an empty group still appears, with zero companies", () => {
    const target = co("TGT", "3585", 1_000);
    const r = screenPeers(index([target]), target, { analysisDate: DAY });
    expect(r.selected).toEqual([]);
    expect(r.funnel.map((f) => [f.tier, f.companies, f.qualified])).toEqual([
      ["sic4", 0, 0],
      ["sic3", 0, 0],
      ["sic2", 0, 0],
    ]);
  });
});

describe("findTarget", () => {
  const wso = co("WSO", "5070", 7_000, {
    listings: [
      { ticker: "WSO", exchange: "NYSE" },
      { ticker: "WSO-B", exchange: "NYSE" },
    ],
  });
  const noRev = co("NOREV", "3585", null);
  const bank = co("JPM", "6021", 100_000);
  const idx = index([wso, noRev, bank], [
    { ticker: "OTCX", exchange: "OTC" },
  ] as never);

  it("finds a company by any of its listed tickers", () => {
    expect(findTarget(idx, "WSO-B", DAY).cik).toBe(wso.cik);
  });

  it("an unknown ticker is TICKER_NOT_FOUND", () => {
    expect(() => findTarget(idx, "ZZZZZ", DAY)).toThrow(TickerNotFoundError);
  });

  it("an off-exchange ticker, a financial or a company without revenue is unsupported", () => {
    expect(() => findTarget(idx, "OTCX", DAY)).toThrow(/major exchange/);
    expect(() => findTarget(idx, "JPM", DAY)).toThrow(UnsupportedIssuerError);
    expect(() => findTarget(idx, "NOREV", DAY)).toThrow(/screening revenue/);
  });
});

// Methodology 0.5.0 §13E: each kind screens only its own kind; banks size on total
// assets (USD m below), digital-asset companies on screening revenue.
describe("screening by issuer kind (§13E)", () => {
  const bank = (ticker: string, sic: string, assetsM: number | null) =>
    co(ticker, sic, null, {
      kind: "bank",
      totalAssets:
        assetsM === null
          ? null
          : { value: assetsM * 1_000_000, accession: "0000000000-26-000001" },
    });
  const crypto = (ticker: string, revenueM: number) =>
    co(ticker, "6199", revenueM, { kind: "digitalAsset" });

  it("an operating target still drops every financial SIC", () => {
    expect(exclusionFor(bank("B", "6021", 100), DAY)?.code).toBe(
      "FINANCIAL_SIC",
    );
    expect(exclusionFor(crypto("C", 100), DAY)?.code).toBe("FINANCIAL_SIC");
  });

  it("a bank target keeps banks only, sized by total assets, revenue not needed", () => {
    expect(exclusionFor(bank("B", "6021", 100), DAY, "bank")).toBeNull();
    expect(exclusionFor(crypto("C", 100), DAY, "bank")?.code).toBe(
      "OTHER_KIND",
    );
    expect(exclusionFor(co("OP", "3585", 100), DAY, "bank")?.code).toBe(
      "OTHER_KIND",
    );
    expect(
      exclusionFor(co("X", "6199", 100, { kind: null }), DAY, "bank")?.code,
    ).toBe("FINANCIAL_SIC");
    expect(exclusionFor(bank("NA", "6021", null), DAY, "bank")?.code).toBe(
      "NO_TOTAL_ASSETS",
    );
  });

  it("ranks banks by closeness of total assets inside the 0.2x–5x band", () => {
    const target = bank("TGT", "6021", 100_000);
    const r = screenPeers(
      index([
        target,
        bank("A", "6021", 90_000), // 0.9x
        bank("B", "6021", 150_000), // 1.5x
        bank("C", "6021", 50_000), // 0.5x
        bank("D", "6021", 300_000), // 3.0x
        bank("E", "6021", 25_000), // 0.25x
        bank("BIG", "6021", 600_000), // 6.0x: out
        crypto("CR", 5_000),
      ]),
      target,
      { analysisDate: DAY },
    );
    // |ln| distances: A 0.105, B 0.405, C 0.693, D 1.099, E 1.386
    expect(tickers(r.selected)).toEqual(["A", "B", "C", "D", "E"]);
    expect(r.selected[0].reason).toContain("total assets 0.9x");
    const why = Object.fromEntries(r.excluded.map((e) => [e.ticker, e.code]));
    expect(why).toEqual({ BIG: "OUTSIDE_SIZE_RANGE" });
    expect(r.excluded[0].detail).toContain("total assets 6.0x");
  });

  it("a digital-asset target keeps digital-asset companies, sized by revenue", () => {
    const target = crypto("TGT", 1_000);
    const r = screenPeers(
      index([
        target,
        ...["A", "B", "C", "D", "E"].map((t, i) => crypto(t, 600 + i * 200)),
        co("LENDR", "6199", 1_000, { kind: null }),
        bank("BK", "6199", 1_000),
      ]),
      target,
      { analysisDate: DAY },
    );
    expect(tickers(r.selected).sort()).toEqual(["A", "B", "C", "D", "E"]);
    const why = Object.fromEntries(r.excluded.map((e) => [e.ticker, e.code]));
    expect(why).toEqual({ BK: "OTHER_KIND", LENDR: "FINANCIAL_SIC" });
    expect(r.selected[0].reason).toContain("revenue");
  });

  it("findTarget: a financial company without a kind is unsupported, and says so for an old index", () => {
    const lender = co("LEND", "6199", 1_000, { kind: null });
    expect(() => findTarget(index([lender]), "LEND", DAY)).toThrow(
      /neither a bank nor a digital-asset company/,
    );
    const old = { ...index([lender]), kindsRecorded: false };
    expect(() => findTarget(old, "LEND", DAY)).toThrow(/must be rebuilt/);
    const noAssets = bank("NA", "6021", null);
    expect(() => findTarget(index([noAssets]), "NA", DAY)).toThrow(
      /no total assets/,
    );
    expect(findTarget(index([bank("OK", "6021", 5)]), "OK", DAY).ticker).toBe(
      "OK",
    );
  });
});
