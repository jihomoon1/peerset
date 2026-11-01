import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildComps, type CompsPeer } from "@/domain/comps";
import { impliedValuationOf } from "@/domain/impliedValuation";
import { METHODOLOGY_VERSION } from "@/domain/policy";
import type { QuoteSnapshot } from "@/domain/types";
import type { ExportSnapshot } from "@/export/snapshot";
import { memoryCache } from "@/lib/cache";
import { InvalidInputError } from "@/lib/errors";
import { loadExportSnapshot, type ExportDeps } from "@/lib/exportSnapshot";
import { FIXTURE_AS_OF } from "@/lib/fixtureMode";
import { indexFromText } from "@/peers/loadIndex";
import { createLimiter, createSecClient } from "@/sec/client";
import { allFixtureDirs, fixtureFetch } from "@/sec/fixtureFetch";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// Server-truth export (blueprint §13, M5 step 1): the export reloads fundamentals,
// reruns screening and recomputes the comps with the same domain code the browser
// runs. For the comps-golden state the snapshot must equal what buildComps gives the
// browser for the same inputs, field by field.

const golden = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/golden/comps-LII-2026Q2.json"),
    "utf8",
  ),
);

const PULLED_AT = "2026-10-26T12:00:00.000Z";
const GENERATED_AT = "2026-10-26T15:30:00.000Z";

function fixtureDeps(): ExportDeps {
  return {
    load: {
      client: createSecClient({
        fetch: fixtureFetch(
          allFixtureDirs({
            pins: "AAON:2026Q2,CARR:2026Q2,GGG:2026Q3,JCI:2026Q2,LII:2026Q2,TT:2026Q2,WSO:2026Q2",
          }),
        ).fetch,
        env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
        logger: () => {},
        limiter: createLimiter(0),
      }),
      cache: memoryCache(),
      asOf: FIXTURE_AS_OF,
      logger: () => {},
      now: () => new Date(PULLED_AT),
    },
    peers: {
      index: () =>
        indexFromText(() =>
          readFileSync(
            path.join(
              process.cwd(),
              "tests/fixtures/peer-index/fixture-peer-index.json",
            ),
            "utf8",
          ),
        ),
      analysisDate: FIXTURE_AS_OF,
      logger: () => {},
    },
    now: () => new Date(GENERATED_AT),
    appVersion: "9.9.9-test",
  };
}

// The fixture index suggests GGG, AAON, CARR and JCI for LII; the golden set swaps
// GGG for TT and WSO, the same state as /c/LII?add=TT,WSO&remove=GGG.
const GOLDEN_REQUEST = {
  target: "LII",
  add: ["TT", "WSO"],
  remove: ["GGG"],
  prices: golden.prices.close as Record<string, number>,
  priceDate: golden.prices.asOfDate as string,
};

let snapshot: ExportSnapshot;
beforeAll(async () => {
  snapshot = await loadExportSnapshot(GOLDEN_REQUEST, fixtureDeps());
});

describe("export snapshot: comps-golden state", () => {
  it("holds exactly the golden peers", () => {
    expect(snapshot.table.peers.map((r) => r.ticker).sort()).toEqual(
      [...golden.peers].sort(),
    );
    expect(snapshot.table.counts).toMatchObject({
      peers: 5,
      loaded: 5,
      failed: 0,
      loading: 0,
    });
  });

  it("equals the browser's buildComps on the same inputs, field by field", async () => {
    const load = async (t: string) => ({
      ...(await fixtureFundamentals(t as "LII")),
      pulledAt: PULLED_AT,
    });
    const target = await load("LII");
    const peers: CompsPeer[] = await Promise.all(
      snapshot.table.peers.map(async (r) => ({
        ticker: r.ticker,
        origin: r.origin!,
        reason: r.reason!,
        state: { kind: "loaded", fundamentals: await load(r.ticker) },
      })),
    );
    // The browser receives fundamentals as JSON, so compare JSON round-trips.
    const quotes: QuoteSnapshot[] = Object.entries(GOLDEN_REQUEST.prices).map(
      ([symbol, close]) => ({
        symbol,
        close,
        currency: "USD",
        asOfDate: GOLDEN_REQUEST.priceDate,
        source: "user_entered",
        retrievedAt: GENERATED_AT,
      }),
    );
    const browser = JSON.parse(
      JSON.stringify(buildComps(target, peers, quotes, FIXTURE_AS_OF)),
    );
    expect(JSON.parse(JSON.stringify(snapshot.table))).toEqual(browser);
    expect(snapshot.implied).toEqual(impliedValuationOf(browser));
  });

  it("stats and the implied median price equal the comps golden", () => {
    const s = snapshot.table.stats.evEbitda;
    expect(s.median).toBeCloseTo(golden.stats.evEbitda.median, 9);
    expect(s.nValid).toBe(4);
    const r = snapshot.implied.evEbitda;
    expect(r.status).toBe("ok");
    if (r.status === "ok")
      expect(r.points.median.impliedPrice).toBeCloseTo(
        golden.impliedValuation.evEbitda.points.median.impliedPrice,
        9,
      );
  });

  it("carries versions, dates, quotes and the peer selection", () => {
    expect(snapshot).toMatchObject({
      appVersion: "9.9.9-test",
      methodologyVersion: METHODOLOGY_VERSION,
      generatedAt: GENERATED_AT,
      analysisDate: FIXTURE_AS_OF,
      priceDate: "2026-10-23",
    });
    expect(snapshot.quotes.map((q) => q.symbol).sort()).toEqual(
      Object.keys(GOLDEN_REQUEST.prices).sort(),
    );
    expect(snapshot.peerSelection?.tier).toBeDefined();
  });

  it("lists every value that isn't a number, with its reason", () => {
    const key = (m: ExportSnapshot["missing"][number]) =>
      `${m.ticker}:${m.column}:${m.status}`;
    const keys = snapshot.missing.map(key);
    for (const c of ["ebitda", "ebitdaMargin", "evEbitda"])
      expect(keys).toContain(`JCI:${c}:unsupported`);
    expect(keys).toContain("WSO:pe:unsupported");
    expect(keys).toContain("WSO:price:missing");
    for (const m of snapshot.missing) expect(m.reason).not.toBe("");
  });

  it("gathers each company's warnings once each", () => {
    const keys = snapshot.warnings.map(
      (w) => `${w.ticker}:${w.code}:${w.message}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(snapshot.warnings.map((w) => `${w.ticker}:${w.code}`)).toContain(
      "LII:W_DA_FROM_CASH_FLOW",
    );
  });
});

describe("export request validation", () => {
  const bad = (patch: Record<string, unknown>) =>
    loadExportSnapshot({ ...GOLDEN_REQUEST, ...patch }, fixtureDeps());

  it.each([
    [
      "more than 12 added peers",
      { add: Array.from({ length: 13 }, (_, i) => `A${i}`) },
    ],
    ["a zero price", { prices: { LII: 0 } }],
    ["a negative price", { prices: { LII: -5 } }],
    ["a price of 1,000,000", { prices: { LII: 1_000_000 } }],
    ["a price date in the future", { priceDate: "2026-10-27" }],
    ["a malformed price date", { priceDate: "2026-02-30" }],
    ["a malformed ticker", { target: "lii;drop" }],
    ["a malformed price ticker", { prices: { "=cmd": 5 } }],
    ["prices without a date", { priceDate: undefined }],
  ])("rejects %s", async (_label, patch) => {
    await expect(bad(patch)).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("rejects a body that isn't an object", async () => {
    await expect(
      loadExportSnapshot("LII", fixtureDeps()),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("accepts no prices: every valuation cell is Missing", async () => {
    const s = await loadExportSnapshot(
      { target: "LII", add: [], remove: [], prices: {} },
      fixtureDeps(),
    );
    expect(s.quotes).toEqual([]);
    expect(s.priceDate).toBeNull();
    expect(s.table.target.cells!.ev.status).toBe("missing");
  });
});
