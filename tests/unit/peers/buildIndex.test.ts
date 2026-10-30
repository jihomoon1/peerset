import { describe, expect, it } from "vitest";
import {
  companyfactsUnreadableShare,
  diffIndexes,
  listedUniverse,
  UNREADABLE_SHARE_LIMIT,
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
    expect(md).toContain(
      "companyfacts 0 (0.00% of listed companies; the build stops above 1%)",
    );
  });
});

describe("companyfactsUnreadableShare", () => {
  const counts = (listed: number, companyfacts: number) => ({
    listed,
    unreadable: { submissions: 0, companyfacts },
  });

  it("is unreadable companyfacts entries ÷ listed companies", () => {
    // 6 ÷ 600 = 0.01 exactly: at the limit, still allowed.
    expect(companyfactsUnreadableShare(counts(600, 6))).toBe(0.01);
    expect(UNREADABLE_SHARE_LIMIT).toBe(0.01);
    // 7 ÷ 600 = 0.0117: over 1%, the build must refuse.
    expect(companyfactsUnreadableShare(counts(600, 7))).toBeGreaterThan(
      UNREADABLE_SHARE_LIMIT,
    );
  });

  it("is 0 with no listed company (nothing to read)", () => {
    expect(companyfactsUnreadableShare(counts(0, 0))).toBe(0);
  });
});
