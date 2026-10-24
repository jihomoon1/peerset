import { describe, expect, it } from "vitest";
import { lookupTicker, parseTickerTable } from "@/sec/tickers";
import { TickerNotFoundError } from "@/lib/errors";
import { fixtureJson } from "../../helpers/fixtures";

const table = parseTickerTable(
  fixtureJson("_shared", "company_tickers_exchange.json.gz"),
);

describe("ticker lookup", () => {
  it("resolves LII to its 10-digit CIK", () => {
    expect(lookupTicker(table, "LII")).toEqual({
      cik: "0001069202",
      name: "LENNOX INTERNATIONAL INC",
      listings: [{ ticker: "LII", exchange: "NYSE" }],
    });
  });

  it("uppercases the input", () => {
    expect(lookupTicker(table, "lii").cik).toBe("0001069202");
  });

  it("returns every listed class for the CIK (WSO and WSO-B)", () => {
    const fromB = lookupTicker(table, "WSO-B");
    expect(fromB.cik).toBe("0000105016");
    expect(fromB.listings).toEqual([
      { ticker: "WSO", exchange: "NYSE" },
      { ticker: "WSO-B", exchange: "NYSE" },
    ]);
    expect(lookupTicker(table, "WSO").listings).toEqual(fromB.listings);
  });

  it("matches exactly, never by prefix or fuzzy match", () => {
    // "WSOB" is not listed; only "WSO-B" is.
    expect(() => lookupTicker(table, "WSOB")).toThrow(TickerNotFoundError);
    expect(() => lookupTicker(table, "LII ")).toThrow(TickerNotFoundError);
  });

  it("rejects malformed input as not found", () => {
    expect(() => lookupTicker(table, "../etc")).toThrow(TickerNotFoundError);
    expect(() => lookupTicker(table, "")).toThrow(TickerNotFoundError);
  });
});
