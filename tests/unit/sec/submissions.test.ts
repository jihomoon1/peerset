import { describe, expect, it } from "vitest";
import { buildIdentity } from "@/sec/submissions";
import { fixtureJson } from "../../helpers/fixtures";

// Report date of the fixtures' capture; within 200 days of both Q2 10-Qs.
const AS_OF = "2026-10-23";

describe("CompanyIdentity from the LII submissions fixture", () => {
  const id = buildIdentity(fixtureJson("LII/2026Q2", "submissions.json.gz"), {
    asOf: AS_OF,
  });

  it("has the identity fields", () => {
    expect(id).toMatchObject({
      cik: "0001069202",
      name: "LENNOX INTERNATIONAL INC",
      ticker: "LII",
      exchange: "NYSE",
      tickers: [{ ticker: "LII", exchange: "NYSE" }],
      sic: "3585",
      fiscalYearEnd: "1231",
    });
    expect(id.sicDescription.length).toBeGreaterThan(0);
    expect(id.stateOfIncorporation.length).toBeGreaterThan(0);
  });

  it("finds the latest periodic filing: the 10-Q filed 2026-07-29", () => {
    expect(id.latestPeriodic).toEqual({
      accession: "0001069202-26-000087",
      form: "10-Q",
      filedDate: "2026-07-29",
      reportDate: "2026-06-30",
      primaryDocument: "lii-20260630.htm",
      indexUrl:
        "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/0001069202-26-000087-index.htm",
    });
  });

  it("is supported", () => {
    expect(id.support).toEqual({ supported: true });
  });
});

describe("CompanyIdentity from the WSO submissions fixture", () => {
  const id = buildIdentity(fixtureJson("WSO/2026Q2", "submissions.json.gz"), {
    asOf: AS_OF,
  });

  it("has both listed classes, SIC 5070 and the latest 10-Q", () => {
    expect(id.cik).toBe("0000105016");
    expect(id.sic).toBe("5070");
    expect(id.tickers).toEqual([
      { ticker: "WSO", exchange: "NYSE" },
      { ticker: "WSO-B", exchange: "NYSE" },
    ]);
    expect(id.latestPeriodic?.accession).toBe("0001193125-26-340204");
    expect(id.latestPeriodic?.form).toBe("10-Q");
    expect(id.support).toEqual({ supported: true });
  });

  it("skips the newer 8-K, 424B7 and Form 4 filings", () => {
    expect(id.latestPeriodic?.reportDate).toBe("2026-06-30");
  });
});

// ── Synthetic cases ─────────────────────────────────────────────────────────

type Row = [form: string, filed: string, report: string];

function synthetic(rows: Row[], overrides: Record<string, unknown> = {}) {
  return {
    cik: "0000000001",
    name: "SYNTHETIC CO",
    sic: "3585",
    sicDescription: "Test",
    tickers: ["SYN"],
    exchanges: ["NYSE"],
    fiscalYearEnd: "1231",
    stateOfIncorporation: "DE",
    filings: {
      recent: {
        accessionNumber: rows.map((_, i) => `0000000001-26-00000${i}`),
        form: rows.map((r) => r[0]),
        filingDate: rows.map((r) => r[1]),
        reportDate: rows.map((r) => r[2]),
        primaryDocument: rows.map((_, i) => `doc${i}.htm`),
      },
    },
    ...overrides,
  };
}

const reasonOf = (raw: unknown, asOf = AS_OF) => {
  const { support } = buildIdentity(raw, { asOf });
  return support.supported ? "supported" : support.reason.code;
};

describe("support check (blueprint §3)", () => {
  it("orders by report date first, then filing date", () => {
    const id = buildIdentity(
      synthetic([
        ["10-Q", "2026-08-01", "2026-06-30"],
        ["10-Q/A", "2026-09-01", "2026-06-30"],
        ["10-K/A", "2026-09-15", "2025-12-31"], // filed last, older period
      ]),
      { asOf: AS_OF },
    );
    expect(id.latestPeriodic?.form).toBe("10-Q/A");
    expect(id.latestPeriodic?.accession).toBe("0000000001-26-000001");
  });

  it("20-F as the latest periodic → FOREIGN_FILER", () => {
    expect(reasonOf(synthetic([["20-F", "2026-04-01", "2025-12-31"]]))).toBe(
      "FOREIGN_FILER",
    );
  });

  it("40-F as the latest periodic → FOREIGN_FILER", () => {
    expect(reasonOf(synthetic([["40-F", "2026-03-15", "2025-12-31"]]))).toBe(
      "FOREIGN_FILER",
    );
  });

  it("SIC 6000–6799 → FINANCIAL_SIC (both ends inclusive)", () => {
    const rows: Row[] = [["10-Q", "2026-08-01", "2026-06-30"]];
    expect(reasonOf(synthetic(rows, { sic: "6000" }))).toBe("FINANCIAL_SIC");
    expect(reasonOf(synthetic(rows, { sic: "6799" }))).toBe("FINANCIAL_SIC");
    expect(reasonOf(synthetic(rows, { sic: "5999" }))).toBe("supported");
    expect(reasonOf(synthetic(rows, { sic: "6800" }))).toBe("supported");
  });

  it("latest periodic filed more than 200 days before asOf → STALE_FILER", () => {
    const rows: Row[] = [["10-Q", "2026-04-05", "2026-03-31"]];
    expect(reasonOf(synthetic(rows), "2026-10-23")).toBe("STALE_FILER"); // 201 days
    expect(reasonOf(synthetic(rows), "2026-10-22")).toBe("supported"); // exactly 200 days
  });

  it("10-KT or 10-QT as the latest periodic → TRANSITION_PERIOD", () => {
    expect(reasonOf(synthetic([["10-KT", "2026-08-01", "2026-06-30"]]))).toBe(
      "TRANSITION_PERIOD",
    );
    expect(
      reasonOf(
        synthetic([
          ["10-K", "2026-02-15", "2025-12-31"],
          ["10-QT", "2026-08-01", "2026-06-30"],
        ]),
      ),
    ).toBe("TRANSITION_PERIOD");
  });

  it("no periodic filing at all → NO_PERIODIC_FILING", () => {
    expect(reasonOf(synthetic([["8-K", "2026-08-01", "2026-07-30"]]))).toBe(
      "NO_PERIODIC_FILING",
    );
  });

  it("never reads the clock: asOf decides staleness", () => {
    const raw = synthetic([["10-Q", "2026-08-01", "2026-06-30"]]);
    expect(reasonOf(raw, "2026-09-01")).toBe("supported");
    expect(reasonOf(raw, "2027-09-01")).toBe("STALE_FILER");
  });
});
