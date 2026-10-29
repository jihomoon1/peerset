import { beforeAll, describe, expect, it } from "vitest";
import {
  buildComps,
  STAT_COLUMNS,
  type CompsPeer,
  type PeerState,
} from "@/domain/comps";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import type { QuoteSnapshot } from "@/domain/types";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// buildComps (blueprint §6, methodology §10–§12): target first, then peers; each row
// priced with the same priceCompany as the single-company view; statistics over
// loaded peers only; lag flag against the peers' median LTM end.

const ANALYSIS = "2026-10-26";
const quote = (symbol: string, close: number): QuoteSnapshot => ({
  symbol,
  close,
  currency: "USD",
  asOfDate: "2026-10-23",
  source: "user_entered",
  retrievedAt: "2026-10-26T12:00:00Z",
});

let LII: CompanyFundamentals;
let CARR: CompanyFundamentals;
let AAON: CompanyFundamentals;
let GGG: CompanyFundamentals;
let WSO: CompanyFundamentals;

beforeAll(async () => {
  [LII, CARR, AAON, GGG, WSO] = await Promise.all([
    fixtureFundamentals("LII"),
    fixtureFundamentals("CARR"),
    fixtureFundamentals("AAON"),
    fixtureFundamentals("GGG"),
    fixtureFundamentals("WSO"),
  ]);
});

const loaded = (f: CompanyFundamentals): PeerState => ({
  kind: "loaded",
  fundamentals: f,
});
const peer = (
  ticker: string,
  state: PeerState,
  origin: CompsPeer["origin"] = "suggested",
): CompsPeer => ({ ticker, origin, reason: "test", state });
const withLtmEnd = (
  f: CompanyFundamentals,
  ltmEnd: string,
): CompanyFundamentals => ({ ...f, ltmEnd });

describe("buildComps rows and cells", () => {
  it("puts the target first, then peers in the order given", () => {
    const t = buildComps(
      LII,
      [peer("CARR", loaded(CARR)), peer("AAON", loaded(AAON))],
      [],
      ANALYSIS,
    );
    expect(t.target.ticker).toBe("LII");
    expect(t.target.role).toBe("target");
    expect(t.peers.map((r) => r.ticker)).toEqual(["CARR", "AAON"]);
  });

  it("before prices: LTM columns have values, valuation columns need a price", () => {
    const t = buildComps(LII, [peer("CARR", loaded(CARR))], [], ANALYSIS);
    const cells = t.target.cells!;
    expect(cells.revenue).toMatchObject({ value: 5_302_200_000 });
    expect(cells.ebitda).toMatchObject({ value: 1_164_900_000 });
    expect(cells.ebitdaMargin.status).toBe("derived");
    for (const col of ["marketCap", "ev", "evRevenue", "evEbitda"] as const)
      expect(cells[col].status).toBe("missing");
    expect(t.target.needsPrice).toEqual(["LII"]);
  });

  it("prices a row with the same numbers as the single-company view", () => {
    // LII golden (tests/golden/LII-2026Q2-valuation.json): price 500 gives
    // EV 18,809,537,500 and EV/EBITDA 18,809,537,500 ÷ 1,164,900,000 = 16.1469x.
    const t = buildComps(LII, [], [quote("LII", 500)], ANALYSIS);
    expect(t.target.cells!.ev).toMatchObject({ value: 18_809_537_500 });
    expect(t.target.cells!.evEbitda.status).toBe("derived");
    if (t.target.cells!.evEbitda.status === "derived")
      expect(t.target.cells!.evEbitda.value).toBeCloseTo(16.1469, 4);
    expect(t.target.cells!.price).toMatchObject({ value: 500 });
  });

  it("a multi-class company has per-class prices and an Unsupported P/E", () => {
    const t = buildComps(
      LII,
      [peer("WSO", loaded(WSO))],
      [quote("WSO", 450), quote("WSO-B", 450)],
      ANALYSIS,
    );
    const wso = t.peers[0];
    // Domain order is XBRL member order; the UI shows SEC listing order.
    expect(wso.valuation!.shareClasses.map((c) => c.ticker).sort()).toEqual([
      "WSO",
      "WSO-B",
    ]);
    expect(wso.cells!.pe.status).toBe("unsupported");
    expect(wso.cells!.marketCap.status).toBe("derived");
  });

  it("loading and failed peers have no cells", () => {
    const t = buildComps(
      LII,
      [
        peer("CARR", { kind: "loading" }),
        peer("HAYW", {
          kind: "failed",
          code: "SEC_UNAVAILABLE",
          message: "SEC is unavailable",
        }),
      ],
      [],
      ANALYSIS,
    );
    expect(t.peers.map((r) => [r.ticker, r.state, r.cells])).toEqual([
      ["CARR", "loading", undefined],
      ["HAYW", "failed", undefined],
    ]);
    expect(t.peers[1].failure).toEqual({
      code: "SEC_UNAVAILABLE",
      message: "SEC is unavailable",
    });
    expect(t.counts).toEqual({ peers: 2, loaded: 0, loading: 1, failed: 1 });
  });
});

describe("buildComps statistics", () => {
  it("has statistics for every column except price", () => {
    const t = buildComps(LII, [], [], ANALYSIS);
    expect(Object.keys(t.stats).sort()).toEqual([...STAT_COLUMNS].sort());
    expect(STAT_COLUMNS).not.toContain("price");
  });

  it("excludes the target from every statistic", () => {
    const t = buildComps(LII, [peer("CARR", loaded(CARR))], [], ANALYSIS);
    expect(t.stats.revenue.nValid).toBe(1);
    expect(t.stats.revenue.used.map((u) => u.ticker)).toEqual(["CARR"]);
  });

  it("counts failed peers as excluded and leaves loading peers out", () => {
    const t = buildComps(
      LII,
      [
        peer("CARR", loaded(CARR)),
        peer("AAON", loaded(AAON)),
        peer("TT", { kind: "loading" }),
        peer("HAYW", { kind: "failed", code: "INTERNAL", message: "boom" }),
      ],
      [],
      ANALYSIS,
    );
    const s = t.stats.revenue;
    expect(s.nValid).toBe(2);
    expect(s.nExcluded).toBe(1);
    expect(s.excluded).toEqual([
      { ticker: "HAYW", status: "failed", reason: "failed to load: boom" },
    ]);
    // Mean of the two peers' LTM revenue, straight from their rows.
    const carr = t.peers[0].cells!.revenue;
    const aaon = t.peers[1].cells!.revenue;
    if (carr.status !== "derived" || aaon.status !== "derived")
      throw new Error("expected derived revenue");
    expect(s.mean).toBe((carr.value + aaon.value) / 2);
  });

  it("valuation statistics wait for prices: unpriced peers are excluded as missing", () => {
    const t = buildComps(
      LII,
      [peer("CARR", loaded(CARR)), peer("AAON", loaded(AAON))],
      [quote("CARR", 60)],
      ANALYSIS,
    );
    expect(t.stats.ev.nValid).toBe(1);
    expect(t.stats.ev.excluded).toMatchObject([
      { ticker: "AAON", status: "missing" },
    ]);
  });
});

describe("buildComps lag flag (methodology §12)", () => {
  it("flags a 52/53-week September quarter beside June filers", () => {
    // GGG's fixture LTM ends 2026-09-25 (fiscal Q3 of a year ending the last Friday
    // of December). Peers CARR, AAON and GGG end 2026-06-30, 2026-06-30, 2026-09-25:
    // median 2026-06-30; GGG is 87 days away (> 75).
    const t = buildComps(
      LII,
      [
        peer("CARR", loaded(CARR)),
        peer("AAON", loaded(AAON)),
        peer("GGG", loaded(GGG)),
      ],
      [],
      ANALYSIS,
    );
    expect(GGG.ltmEnd).toBe("2026-09-25");
    expect(t.lag.peerMedianLtmEnd).toBe("2026-06-30");
    const ggg = t.peers[2];
    expect(ggg.lag).toMatchObject({
      code: "W_PERIOD_LAG",
      severity: "caution",
    });
    expect(ggg.lag!.message).toContain("87 days");
    expect(t.peers[0].lag).toBeUndefined();
    expect(t.target.lag).toBeUndefined();
  });

  it("75 days is not a lag; 76 days is", () => {
    // Peers end 2026-06-30 (×2); the median is 2026-06-30.
    // 2026-06-30 + 75 days = 2026-09-13; + 76 days = 2026-09-14.
    const peers = [peer("CARR", loaded(CARR)), peer("AAON", loaded(AAON))];
    const at75 = buildComps(withLtmEnd(LII, "2026-09-13"), peers, [], ANALYSIS);
    const at76 = buildComps(withLtmEnd(LII, "2026-09-14"), peers, [], ANALYSIS);
    expect(at75.target.lag).toBeUndefined();
    expect(at76.target.lag).toMatchObject({ code: "W_PERIOD_LAG" });
  });

  it("checks earlier periods too, and uses the median of day numbers", () => {
    // Peer ends 2026-03-31, 2026-06-30 → median day = midpoint (45.5 days apart):
    // 2026-05-15 12:00. A target ending 2026-01-31 is 104.5 days before it: flagged.
    const t = buildComps(
      withLtmEnd(LII, "2026-01-31"),
      [
        peer("CARR", loaded(withLtmEnd(CARR, "2026-03-31"))),
        peer("AAON", loaded(AAON)),
      ],
      [],
      ANALYSIS,
    );
    expect(t.lag.peerMedianLtmEnd).toBe("2026-05-15");
    expect(t.target.lag).toMatchObject({ code: "W_PERIOD_LAG" });
    expect(t.peers.every((r) => r.lag === undefined)).toBe(true);
  });

  it("has no median and no flags without loaded peers", () => {
    const t = buildComps(
      LII,
      [peer("CARR", { kind: "loading" })],
      [],
      ANALYSIS,
    );
    expect(t.lag.peerMedianLtmEnd).toBeNull();
    expect(t.target.lag).toBeUndefined();
  });
});
