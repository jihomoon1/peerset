import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFromFiles } from "../../scripts/peer-index/build";
import { decodeIndex, encodeIndex } from "@/peers/indexFormat";
import {
  companyfactsUnreadableShare,
  UNREADABLE_SHARE_LIMIT,
} from "@/peers/buildIndex";
import type { PeerIndex } from "@/peers/indexTypes";

// The builder on tiny synthetic copies of SEC's bulk files (generate.ts in that
// folder). Offline: no network, same code path as the monthly job after download.

const DIR = path.join("tests", "fixtures", "peer-index");
const SOURCES = {
  tickers: {
    url: "https://www.sec.gov/files/company_tickers_exchange.json",
    lastModified: "Sat, 31 Oct 2026 22:01:05 GMT",
  },
  submissions: {
    url: "https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip",
    lastModified: "Sun, 01 Nov 2026 04:27:22 GMT",
  },
  companyfacts: {
    url: "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip",
    lastModified: "Sun, 01 Nov 2026 04:19:52 GMT",
  },
};

const build = () =>
  buildFromFiles({
    tickersPath: path.join(DIR, "company_tickers_exchange.json"),
    submissionsZip: path.join(DIR, "submissions.zip"),
    companyfactsZip: path.join(DIR, "companyfacts.zip"),
    sources: SOURCES,
  });

const byTicker = (index: PeerIndex, t: string) =>
  index.companies.find((c) => c.ticker === t);

describe("buildFromFiles on the synthetic bulk files", async () => {
  const index = await build();

  it("keeps only companies with a NYSE, Nasdaq or CBOE ticker", () => {
    expect(index.companies.map((c) => c.ticker)).toEqual([
      "ALFA",
      "FRGN",
      "NORV",
      "WK53",
      "SWCH",
      "NOSB",
    ]);
    expect(index.unlisted).toEqual([
      { ticker: "OTCO", exchange: "OTC" },
      { ticker: "TXCO", exchange: "TXSE" },
      { ticker: "BLNK", exchange: "" },
    ]);
  });

  it("records identity, listings and the latest periodic filing", () => {
    expect(byTicker(index, "ALFA")).toEqual({
      cik: "0000000001",
      name: "Alpha HVAC Inc",
      ticker: "ALFA",
      listings: [
        { ticker: "ALFA", exchange: "NYSE" },
        { ticker: "ALFA-B", exchange: "NYSE" },
      ],
      sic: "3585",
      sicDescription: "Industry 3585",
      fiscalYearEnd: "1231",
      incorporation: "DE",
      latest: {
        form: "10-Q",
        filedDate: "2026-07-29",
        reportDate: "2026-06-30",
        accession: "0000000001-26-000002",
      },
      files20F: false,
      revenue: {
        value: 1_000_000_000,
        periodEnd: "2025-12-31",
        concept: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
        accession: "0000000001-26-000001",
      },
      revenueNote: null,
    });
  });

  it("flags 20-F filers and has no revenue for them", () => {
    const f = byTicker(index, "FRGN")!;
    expect(f.files20F).toBe(true);
    expect(f.latest?.form).toBe("20-F");
    expect(f.revenue).toBeNull();
  });

  it("explains missing revenue", () => {
    expect(byTicker(index, "NORV")).toMatchObject({
      revenue: null,
      revenueNote: "no fiscal-year revenue in a 10-K or 10-K/A",
    });
    expect(byTicker(index, "NOSB")).toMatchObject({
      latest: null,
      revenue: null,
      revenueNote: "no companyfacts entry",
    });
  });

  it("handles a 53-week year and a revenue concept switch", () => {
    expect(byTicker(index, "WK53")?.revenue).toMatchObject({
      value: 2_000_000_000,
      periodEnd: "2026-01-03",
    });
    expect(byTicker(index, "SWCH")?.revenue).toMatchObject({
      value: 450_000_000,
      concept: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
    });
  });

  it("writes metadata: sources, methodology version and counts", () => {
    expect(index.meta).toEqual({
      generatedAt: "2026-11-01T04:27:22.000Z", // newest Last-Modified
      methodologyVersion: "0.3.4",
      sources: SOURCES,
      counts: {
        total: 9,
        listed: 6,
        withRevenue: 3,
        byExclusionReason: {
          FOREIGN_FILER: 1,
          NO_PERIODIC_FILING: 1,
          NO_SCREENING_REVENUE: 1,
          STALE_FILING: 2, // WK53 and SWCH: 10-K only, over 200 days by Nov 1
        },
        unreadable: { submissions: 0, companyfacts: 0 },
      },
    });
  });

  it("passes the unreadable-entry guard: 0 of 6 listed companies", () => {
    const share = companyfactsUnreadableShare(index.meta.counts);
    expect(share).toBe(0);
    expect(share).toBeLessThanOrEqual(UNREADABLE_SHARE_LIMIT);
  });

  it("is deterministic: the same inputs give byte-identical output", async () => {
    expect(encodeIndex(await build())).toBe(encodeIndex(index));
  });

  it("round-trips through the file format", () => {
    expect(decodeIndex(JSON.parse(encodeIndex(index)))).toEqual(index);
  });
});
