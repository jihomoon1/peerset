import { describe, expect, it } from "vitest";
import { trimCompanyFacts } from "@/sec/companyFacts";
import { CONCEPT_WHITELIST, PERIODIC_FORMS } from "@/domain/policy";
import { SecSchemaChangedError } from "@/lib/errors";
import { fixtureJson } from "../../helpers/fixtures";

const lii = trimCompanyFacts(fixtureJson("LII/2026Q2", "companyfacts.json.gz"));
const wso = trimCompanyFacts(fixtureJson("WSO/2026Q2", "companyfacts.json.gz"));

describe("companyfacts trimming", () => {
  it("LII's newest periodic accession is the 10-Q filed 2026-04-29 (blueprint §8.3)", () => {
    expect(lii.newestPeriodicAccession).toBe("0001069202-26-000054");
    expect(lii.periodicAccessions.has("0001069202-26-000087")).toBe(false);
  });

  it("WSO's companyfacts includes the Q2 10-Q", () => {
    expect(wso.periodicAccessions.has("0001193125-26-340204")).toBe(true);
    expect(wso.newestPeriodicAccession).toBe("0001193125-26-340204");
  });

  it("drops non-periodic forms (WSO has 424B7 and DEF 14A facts)", () => {
    const accessionsOf424b7 = new Set(["0001193125-26-421652"]);
    for (const f of wso.facts) {
      expect(PERIODIC_FORMS.has(f.filing.form)).toBe(true);
      expect(accessionsOf424b7.has(f.filing.accession)).toBe(false);
    }
  });

  it("keeps only whitelisted concepts and accepted units", () => {
    for (const f of [...lii.facts, ...wso.facts]) {
      expect(CONCEPT_WHITELIST.has(f.concept)).toBe(true);
      expect(["USD", "USD/shares", "shares"]).toContain(f.unit);
      expect(f.source).toBe("companyfacts");
      expect(f.dimensions).toEqual({});
    }
  });

  it("gives duration facts a start and instant facts none", () => {
    const revenue = lii.facts.find(
      (f) =>
        f.concept === "us-gaap:Revenues" &&
        f.period.start === "2026-01-01" &&
        f.period.end === "2026-03-31",
    );
    expect(revenue?.period.kind).toBe("duration");
    const cash = lii.facts.find(
      (f) =>
        f.concept === "us-gaap:CashAndCashEquivalentsAtCarryingValue" &&
        f.period.end === "2026-03-31",
    );
    expect(cash?.period).toEqual({ kind: "instant", end: "2026-03-31" });
  });

  it("carries the filing reference for each fact", () => {
    const f = lii.facts.find(
      (x) => x.filing.accession === "0001069202-26-000054",
    );
    expect(f?.filing).toEqual({
      accession: "0001069202-26-000054",
      form: "10-Q",
      filedDate: "2026-04-29",
      reportDate: "2026-03-31",
      indexUrl:
        "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000054/0001069202-26-000054-index.htm",
    });
  });

  it("uses the submissions report date when given", () => {
    const withDates = trimCompanyFacts(
      fixtureJson("LII/2026Q2", "companyfacts.json.gz"),
      { reportDates: new Map([["0001069202-26-000054", "2026-03-31"]]) },
    );
    const f = withDates.facts.find(
      (x) => x.filing.accession === "0001069202-26-000054",
    );
    expect(f?.filing.reportDate).toBe("2026-03-31");
  });

  it("is small: LII trimmed output is well under 200 KB serialized", () => {
    const bytes = Buffer.byteLength(JSON.stringify(lii.facts));
    console.log(
      `LII trimmed companyfacts: ${lii.facts.length} facts, ${bytes.toLocaleString("en-US")} bytes`,
    );
    expect(bytes).toBeLessThan(200 * 1024);
  });

  it("keeps two years of periods before the newest period end, enough for LTM", () => {
    // Newest LII period end in companyfacts is 2026-03-31; cutoff is 730 days earlier.
    for (const f of lii.facts) expect(f.period.end >= "2024-03-31").toBe(true);
    const has = (start: string, end: string) =>
      lii.facts.some(
        (f) =>
          f.concept === "us-gaap:Revenues" &&
          f.period.start === start &&
          f.period.end === end,
      );
    expect(has("2025-01-01", "2025-12-31")).toBe(true); // FY2025
    expect(has("2025-01-01", "2025-03-31")).toBe(true); // prior-year Q1 YTD
    expect(has("2026-01-01", "2026-03-31")).toBe(true); // current Q1 YTD
  });

  it("counts accessions before the history window is applied", () => {
    expect(lii.periodicAccessions.has("0001628280-24-032782")).toBe(true); // 10-Q filed 2024-07-24
  });

  it("throws SEC_SCHEMA_CHANGED when a whitelisted concept is malformed", () => {
    const raw = {
      cik: 1,
      entityName: "X",
      facts: { "us-gaap": { Revenues: { units: { USD: [{ end: "x" }] } } } },
    };
    expect(() => trimCompanyFacts(raw)).toThrow(SecSchemaChangedError);
  });

  it("ignores a malformed concept that is not whitelisted", () => {
    const raw = {
      cik: 1,
      entityName: "X",
      facts: { "us-gaap": { SomethingElse: { units: "garbage" } } },
    };
    expect(trimCompanyFacts(raw).facts).toEqual([]);
  });
});
