import { describe, expect, it } from "vitest";
import {
  CompanyFactsSchema,
  CompanyTickersExchangeSchema,
  FilingIndexSchema,
  parseOrThrow,
  SubmissionsSchema,
} from "@/sec/schemas";
import { SecSchemaChangedError } from "@/lib/errors";
import { fixtureJson } from "../../helpers/fixtures";

const COMPANIES = ["LII/2026Q2", "WSO/2026Q2"];

describe("SEC schemas accept the committed fixtures", () => {
  it("company_tickers_exchange.json", () => {
    const data = parseOrThrow(
      CompanyTickersExchangeSchema,
      fixtureJson("_shared", "company_tickers_exchange.json.gz"),
      "company_tickers_exchange",
    );
    expect(data.data.length).toBeGreaterThan(5000);
  });

  it.each(COMPANIES)("%s submissions", (dir) => {
    const data = parseOrThrow(
      SubmissionsSchema,
      fixtureJson(dir, "submissions.json.gz"),
      "submissions",
    );
    expect(data.filings.recent.accessionNumber.length).toBe(
      data.filings.recent.form.length,
    );
  });

  it.each(COMPANIES)("%s companyfacts", (dir) => {
    const data = parseOrThrow(
      CompanyFactsSchema,
      fixtureJson(dir, "companyfacts.json.gz"),
      "companyfacts",
    );
    expect(Object.keys(data.facts["us-gaap"] ?? {}).length).toBeGreaterThan(50);
  });

  it.each(COMPANIES)("%s filing index.json", (dir) => {
    const data = parseOrThrow(
      FilingIndexSchema,
      fixtureJson(dir, "index.json.gz"),
      "filing index",
    );
    expect(data.directory.item.some((i) => i.name.endsWith("_htm.xml"))).toBe(
      true,
    );
  });
});

describe("schema failures", () => {
  it("throws SEC_SCHEMA_CHANGED with the failing path, never a guess", () => {
    const broken = {
      cik: "0001069202",
      name: "X",
      sic: "3585",
      sicDescription: "",
      tickers: [],
      exchanges: [],
      fiscalYearEnd: "1231",
      stateOfIncorporation: "DE",
      filings: { recent: { accessionNumber: "not-an-array" } },
    };
    let caught: unknown;
    try {
      parseOrThrow(SubmissionsSchema, broken, "submissions");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SecSchemaChangedError);
    expect((caught as SecSchemaChangedError).detail).toContain(
      "filings.recent.accessionNumber",
    );
  });

  it("ignores fields it does not use", () => {
    const data = parseOrThrow(
      FilingIndexSchema,
      {
        directory: { item: [{ name: "a_htm.xml", brandNew: 1 }], extra: true },
      },
      "filing index",
    );
    expect(data.directory.item[0].name).toBe("a_htm.xml");
  });
});
