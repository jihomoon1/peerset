import { describe, expect, it } from "vitest";
import { createPeersHandler, type PeersDeps } from "@/app/api/peers/handler";
import type { PeerIndex, PeerIndexCompany } from "@/peers/indexTypes";

// /api/peers on a synthetic index (blueprint §13): no SEC calls, status codes per §15.

let n = 0;
const co = (
  ticker: string,
  sic: string,
  revenueM: number | null,
): PeerIndexCompany => ({
  cik: String(++n).padStart(10, "0"),
  name: `${ticker} Corp`,
  ticker,
  listings: [{ ticker, exchange: "NYSE" }],
  sic,
  sicDescription: `Industry ${sic}`,
  fiscalYearEnd: "1231",
  incorporation: "DE",
  latest: {
    form: "10-Q",
    filedDate: "2026-07-29",
    reportDate: "2026-06-30",
    accession: "a",
  },
  files20F: false,
  revenue:
    revenueM === null
      ? null
      : {
          value: revenueM * 1e6,
          periodEnd: "2025-12-31",
          concept: "us-gaap:Revenues",
          accession: "b",
        },
  revenueNote: revenueM === null ? "no companyfacts entry" : null,
});

const companies = [
  co("TGT", "3585", 1_000),
  ...["AA", "BB", "CC", "DD", "EE", "FF"].map((t, i) =>
    co(t, "3585", 500 + i * 200),
  ),
  co("BANK", "6021", 900),
  co("NOREV", "3585", null),
];

const index = (cs: PeerIndexCompany[]): PeerIndex => ({
  meta: {
    generatedAt: "2026-10-01T04:27:22.000Z",
    methodologyVersion: "0.3.2",
    sources: {
      tickers: { url: "t", lastModified: "x" },
      submissions: { url: "s", lastModified: "x" },
      companyfacts: { url: "c", lastModified: "x" },
    },
    counts: {
      total: 0,
      listed: cs.length,
      withRevenue: 0,
      byExclusionReason: {},
      unreadable: { submissions: 0, companyfacts: 0 },
    },
  },
  companies: cs,
  unlisted: [{ ticker: "OTCX", exchange: "OTC" }],
});

function handler(cs = companies) {
  const logs: string[] = [];
  const deps: PeersDeps = {
    index: () => index(cs),
    analysisDate: "2026-10-28",
    logger: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
  };
  return {
    GET: createPeersHandler(
      () => deps,
      () => {},
    ),
    logs,
  };
}

const get = async (query: string, cs?: PeerIndexCompany[]) => {
  const { GET, logs } = handler(cs);
  const res = await GET(new Request(`http://localhost/api/peers${query}`));
  return { res, body: await res.json(), logs };
};

describe("GET /api/peers", () => {
  it("returns the peer selection for a listed target", async () => {
    const { res, body, logs } = await get("?ticker=tgt");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.tier).toBe("sic4");
    expect(body.selected).toHaveLength(6);
    expect(body.target).toMatchObject({
      ticker: "TGT",
      sic: "3585",
      screeningRevenue: 1_000_000_000,
    });
    expect(body.indexGeneratedAt).toBe("2026-10-01T04:27:22.000Z");
    expect(body.excluded.map((e: { code: string }) => e.code)).toEqual([
      "NO_SCREENING_REVENUE",
    ]);
    expect(logs.at(-1)).toContain('"event":"peers"');
  });

  it("takes a peer count from 5 to 12", async () => {
    expect((await get("?ticker=TGT&count=5")).body.selected).toHaveLength(5);
    const bad = await get("?ticker=TGT&count=13");
    expect(bad.res.status).toBe(400);
    expect((await get("?ticker=TGT&count=five")).res.status).toBe(400);
  });

  it("400 for a malformed ticker, 404 for an unknown one", async () => {
    expect((await get("?ticker=")).res.status).toBe(400);
    expect((await get("?ticker=bad$")).res.status).toBe(400);
    const unknown = await get("?ticker=ZZZZZ");
    expect(unknown.res.status).toBe(404);
    expect(unknown.body.code).toBe("TICKER_NOT_FOUND");
  });

  it("422 for an off-exchange, financial or revenue-less target", async () => {
    for (const t of ["OTCX", "BANK", "NOREV"]) {
      const { res, body } = await get(`?ticker=${t}`);
      expect(res.status).toBe(422);
      expect(body.code).toBe("UNSUPPORTED_ISSUER");
    }
  });

  it("503 while the index hasn't been built", async () => {
    const { res, body } = await get("?ticker=TGT", []);
    expect(res.status).toBe(503);
    expect(body.code).toBe("PEER_INDEX_UNAVAILABLE");
  });
});
