import { describe, expect, it } from "vitest";
import { getCompanyFacts } from "@/sec/freshness";
import { createLimiter, createSecClient } from "@/sec/client";
import { UnsupportedIssuerError } from "@/lib/errors";
import { fixtureFetch } from "../../helpers/fixtures";

const AS_OF = "2026-10-23";

function clientFor(dirs: string[]) {
  const fake = fixtureFetch(dirs);
  const client = createSecClient({
    fetch: fake.fetch,
    env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
    logger: () => {},
    limiter: createLimiter(0), // no pacing delay in tests; the real limiter is tested in client.test.ts
  });
  return { client, requested: fake.requested };
}

describe("getCompanyFacts — LII (companyfacts behind)", async () => {
  const { client, requested } = clientFor(["LII/2026Q2"]);
  const result = await getCompanyFacts("0001069202", { asOf: AS_OF, client });

  it("parses the filing because companyfacts lacks the latest 10-Q", () => {
    expect(result.freshness).toEqual({
      status: "filing-parsed",
      latestAccession: "0001069202-26-000087",
      companyfactsNewestAccession: "0001069202-26-000054",
    });
    expect(result.warnings.map((w) => w.code)).toContain("W_FILING_PARSED");
  });

  it("merges the instance's 2026-06-30 debt values, tagged as filing facts", () => {
    const cp = result.facts.filter(
      (f) =>
        f.concept === "us-gaap:CommercialPaper" &&
        f.period.end === "2026-06-30" &&
        Object.keys(f.dimensions).length === 0,
    );
    expect(cp).toHaveLength(1);
    expect(cp[0]).toMatchObject({
      value: 412_000_000,
      source: "filing",
      filing: { accession: "0001069202-26-000087" },
    });
  });

  it("returns facts from both sources without selecting between them", () => {
    const sources = new Set(result.facts.map((f) => f.source));
    expect(sources).toEqual(new Set(["companyfacts", "filing"]));
    // FY2025 revenue appears in companyfacts from both the 10-K and later 10-Qs' comparatives.
    const fy2025 = result.facts.filter(
      (f) =>
        f.concept === "us-gaap:Revenues" &&
        f.period.start === "2025-01-01" &&
        f.period.end === "2025-12-31" &&
        Object.keys(f.dimensions).length === 0,
    );
    expect(fy2025.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the cover-page share count from the instance", () => {
    const shares = result.facts.find(
      (f) =>
        f.concept === "dei:EntityCommonStockSharesOutstanding" &&
        f.source === "filing",
    );
    expect(shares?.value).toBe(34_560_675);
  });

  it("uses 6 SEC requests: submissions, companyfacts, index, FilingSummary, balance sheet, instance", () => {
    expect(result.requestsMade).toBe(6);
    expect(requested).toEqual([
      "https://data.sec.gov/submissions/CIK0001069202.json",
      "https://data.sec.gov/api/xbrl/companyfacts/CIK0001069202.json",
      "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/index.json",
      "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/FilingSummary.xml",
      "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/R2.htm",
      "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/lii-20260630_htm.xml",
    ]);
  });

  it("returns the balance-sheet face lines at the report date (methodology §7 rule 1)", () => {
    expect(result.balanceSheet.date).toBe("2026-06-30");
    const face = result.balanceSheet.face;
    if (face.kind !== "face") throw new Error(face.reason);
    expect(face).toMatchObject({
      url: "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/R2.htm",
      statement: "Consolidated Balance Sheets",
      scale: "Millions",
    });
    expect(face.lines.map((l) => l.concept)).toContain(
      "us-gaap:LongTermDebtAndCapitalLeaseObligations",
    );
  });

  it("parses every face-line concept from the instance, whitelisted or not", () => {
    const ap = result.facts.find(
      (f) =>
        f.concept === "us-gaap:AccountsPayableCurrent" &&
        f.period.end === "2026-06-30",
    );
    expect(ap).toMatchObject({ value: 523_500_000, source: "filing" });
  });

  it("returns the identity", () => {
    expect(result.identity.cik).toBe("0001069202");
    expect(result.identity.support).toEqual({ supported: true });
  });
});

describe("getCompanyFacts — WSO (companyfacts current)", async () => {
  const { client } = clientFor(["WSO/2026Q2"]);
  const result = await getCompanyFacts("0000105016", { asOf: AS_OF, client });

  it("is current", () => {
    expect(result.freshness).toEqual({
      status: "current",
      latestAccession: "0001193125-26-340204",
      companyfactsNewestAccession: "0001193125-26-340204",
    });
    expect(result.warnings.map((w) => w.code)).not.toContain("W_FILING_PARSED");
  });

  it("still has both share classes from the instance's cover page", () => {
    const classes = result.facts
      .filter((f) => f.concept === "dei:EntityCommonStockSharesOutstanding")
      .map((f) => [f.dimensions["us-gaap:StatementClassOfStockAxis"], f.value]);
    expect(Object.fromEntries(classes)).toEqual({
      "us-gaap:CommonStockMember": 35_588_756,
      "us-gaap:CommonClassBMember": 5_663_438,
    });
  });

  it("returns the cover-page trading symbols as text facts", () => {
    const symbols = result.textFacts
      .filter((f) => f.concept === "dei:TradingSymbol")
      .map((f) => f.value)
      .sort();
    expect(symbols).toEqual(["WSO", "WSOB"]);
  });

  it("stays within the 7-request budget", () => {
    expect(result.requestsMade).toBe(6);
  });

  it("finds the balance sheet at R4.htm", () => {
    expect(result.balanceSheet.face).toMatchObject({
      kind: "face",
      statement: "Condensed Consolidated Unaudited Balance Sheets",
    });
  });
});

describe("getCompanyFacts — edge cases", () => {
  it("refuses an unsupported issuer after the submissions request", async () => {
    const { client, requested } = clientFor(["LII/2026Q2"]);
    // A year later, LII's July 10-Q is more than 200 days old.
    await expect(
      getCompanyFacts("0001069202", { asOf: "2027-10-23", client }),
    ).rejects.toBeInstanceOf(UnsupportedIssuerError);
    expect(requested).toHaveLength(1);
  });

  it("reports filing-missing when the latest filing's index is not found", async () => {
    // Serve only submissions and companyfacts; the index and instance 404.
    const fake = fixtureFetch(["LII/2026Q2"]);
    const only = (async (input: string | URL | Request) =>
      String(input).includes("/Archives/")
        ? new Response("", { status: 404 })
        : fake.fetch(input)) as typeof fetch;
    const c = createSecClient({
      fetch: only,
      env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
      logger: () => {},
      limiter: createLimiter(0),
    });
    const result = await getCompanyFacts("0001069202", {
      asOf: AS_OF,
      client: c,
    });
    expect(result.freshness.status).toBe("filing-missing");
    expect(result.warnings.map((w) => w.code)).toContain("W_FILING_MISSING");
    expect(result.facts.every((f) => f.source === "companyfacts")).toBe(true);
  });
});

describe("getCompanyFacts — balance-sheet face unavailable", () => {
  it("still parses the instance when FilingSummary.xml is missing", async () => {
    const fake = fixtureFetch(["LII/2026Q2"]);
    const noSummary = (async (input: string | URL | Request) =>
      String(input).endsWith("/FilingSummary.xml")
        ? new Response("", { status: 404 })
        : fake.fetch(input)) as typeof fetch;
    const c = createSecClient({
      fetch: noSummary,
      env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
      logger: () => {},
      limiter: createLimiter(0),
    });
    const result = await getCompanyFacts("0001069202", {
      asOf: AS_OF,
      client: c,
    });
    expect(result.balanceSheet.face).toEqual({
      kind: "unavailable",
      reason: "FilingSummary.xml returned 404",
    });
    expect(result.freshness.status).toBe("filing-parsed");
    expect(result.requestsMade).toBe(5);
  });

  it("is unavailable when the filing itself is missing", async () => {
    const fake = fixtureFetch(["LII/2026Q2"]);
    const only = (async (input: string | URL | Request) =>
      String(input).includes("/Archives/")
        ? new Response("", { status: 404 })
        : fake.fetch(input)) as typeof fetch;
    const c = createSecClient({
      fetch: only,
      env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
      logger: () => {},
      limiter: createLimiter(0),
    });
    const result = await getCompanyFacts("0001069202", {
      asOf: AS_OF,
      client: c,
    });
    expect(result.balanceSheet.face.kind).toBe("unavailable");
  });
});

describe("getCompanyFacts — fetch caching", () => {
  it("caches the rendered statements for 30 days per accession", async () => {
    const fake = fixtureFetch(["LII/2026Q2"]);
    const inits = new Map<string, RequestInit | undefined>();
    const client = createSecClient({
      fetch: (async (input: string, init?: RequestInit) => {
        inits.set(String(input), init);
        return fake.fetch(input, init);
      }) as typeof fetch,
      env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
      logger: () => {},
      limiter: createLimiter(0),
    });
    await getCompanyFacts("0001069202", { asOf: AS_OF, client });
    const base =
      "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/";
    for (const file of ["FilingSummary.xml", "R2.htm"])
      expect(inits.get(base + file), file).toMatchObject({
        cache: "force-cache",
        next: { revalidate: 30 * 24 * 3600 },
      });
  });

  it("caches submissions when asked, never companyfacts", async () => {
    const fake = fixtureFetch(["LII/2026Q2"]);
    const inits = new Map<string, RequestInit | undefined>();
    const client = createSecClient({
      fetch: (async (input: string, init?: RequestInit) => {
        inits.set(String(input), init);
        return fake.fetch(input, init);
      }) as typeof fetch,
      env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
      logger: () => {},
      limiter: createLimiter(0),
    });
    await getCompanyFacts("0001069202", {
      asOf: AS_OF,
      client,
      submissionsRevalidate: 21_600,
    });
    expect(
      inits.get("https://data.sec.gov/submissions/CIK0001069202.json"),
    ).toMatchObject({ cache: "force-cache", next: { revalidate: 21_600 } });
    expect(
      inits.get(
        "https://data.sec.gov/api/xbrl/companyfacts/CIK0001069202.json",
      ),
    ).not.toHaveProperty("cache");
  });
});
