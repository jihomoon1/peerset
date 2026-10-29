import { describe, expect, it } from "vitest";
import {
  diffIndexes,
  listedUniverse,
  summaryMarkdown,
} from "@/peers/buildIndex";
import type { PeerIndex, PeerIndexCompany } from "@/peers/indexTypes";

const company = (
  cik: string,
  ticker: string,
  sic: string,
): PeerIndexCompany => ({
  cik,
  name: `${ticker} Inc`,
  ticker,
  listings: [{ ticker, exchange: "NYSE" }],
  sic,
  sicDescription: "",
  fiscalYearEnd: "1231",
  incorporation: "DE",
  latest: null,
  files20F: false,
  revenue: null,
  revenueNote: "no companyfacts entry",
});

const index = (companies: PeerIndexCompany[]): PeerIndex => ({
  meta: {
    generatedAt: "2026-11-01T04:27:22.000Z",
    methodologyVersion: "0.3.2",
    sources: {
      tickers: { url: "t", lastModified: "a" },
      submissions: { url: "s", lastModified: "b" },
      companyfacts: { url: "c", lastModified: "c" },
    },
    counts: {
      total: 9,
      listed: companies.length,
      withRevenue: 0,
      byExclusionReason: { NO_PERIODIC_FILING: companies.length },
      unreadable: { submissions: 0, companyfacts: 0 },
    },
  },
  companies,
  unlisted: [],
});

describe("listedUniverse", () => {
  it("rejects a ticker file whose shape changed", () => {
    expect(() => listedUniverse({ fields: ["cik"], data: [] })).toThrow(
      /company tickers/,
    );
  });
});

describe("diffIndexes", () => {
  const prev = index([
    company("1", "AAA", "3585"),
    company("2", "BBB", "3585"),
  ]);
  const next = index([
    company("2", "BBB", "3822"),
    company("3", "CCC", "5070"),
  ]);

  it("lists added, removed and reclassified companies", () => {
    const d = diffIndexes(prev, next);
    expect(d.added.map((c) => c.ticker)).toEqual(["CCC"]);
    expect(d.removed.map((c) => c.ticker)).toEqual(["AAA"]);
    expect(d.reclassified).toEqual([
      { company: next.companies[0], fromSic: "3585" },
    ]);
  });

  it("treats every company as added on the first run", () => {
    expect(diffIndexes(null, next).added).toHaveLength(2);
  });

  it("summarizes counts and changes for the PR body", () => {
    const md = summaryMarkdown(next, diffIndexes(prev, next));
    expect(md).toContain("listed on NYSE, Nasdaq or Cboe: 2");
    expect(md).toContain("NO_PERIODIC_FILING 2");
    expect(md).toContain("### Added (1)\n- CCC · CCC Inc (CIK 3, SIC 5070)");
    expect(md).toContain(
      "### Reclassified SIC (1)\n- BBB · BBB Inc (CIK 2, SIC 3822): was SIC 3585",
    );
  });
});
