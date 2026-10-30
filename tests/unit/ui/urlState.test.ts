import { describe, expect, it } from "vitest";
import { parseUrlState, urlQuery } from "@/ui/urlState";

// The whole analysis lives in the URL (M4b): added and removed peers, prices per
// listed class and the shared price date. Nothing is stored on a server. Parsing is
// defensive: anything malformed is dropped, never guessed.

const parse = (query: string) => parseUrlState(new URLSearchParams(query));

describe("parseUrlState", () => {
  it("reads the documented example", () => {
    expect(
      parse(
        "add=TT,WSO&remove=HAYW&px=LII:500,CARR:52.1,WSO-B:450&pxdate=2026-10-28",
      ),
    ).toEqual({
      add: ["TT", "WSO"],
      remove: ["HAYW"],
      prices: { LII: "500", CARR: "52.1", "WSO-B": "450" },
      priceDate: "2026-10-28",
    });
  });

  it("is empty without parameters", () => {
    expect(parse("")).toEqual({ add: [], remove: [], prices: {} });
  });

  it("uppercases tickers, drops malformed ones and duplicates", () => {
    expect(parse("add=tt,,tt,1BAD,TOOLONGTICKER1,<script>,wso").add).toEqual([
      "TT",
      "WSO",
    ]);
  });

  it("keeps at most 12 added tickers", () => {
    const many = Array.from({ length: 15 }, (_, i) => `A${i}`).join(",");
    expect(parse(`add=${many}`).add).toHaveLength(12);
  });

  it("keeps only prices above 0 and below 1,000,000", () => {
    expect(
      parse("px=A:0,B:-5,C:1000000,D:abc,E:12.5,F:,G,H:1e3,I:999999.99").prices,
    ).toEqual({ E: "12.5", I: "999999.99" });
  });

  it("ignores a price date that isn't a real ISO date", () => {
    expect(parse("pxdate=2026-02-30").priceDate).toBeUndefined();
    expect(parse("pxdate=yesterday").priceDate).toBeUndefined();
  });

  it("uses only the first of a repeated parameter", () => {
    expect(parse("add=TT&add=WSO").add).toEqual(["TT"]);
  });

  it("ignores absurdly long parameters", () => {
    expect(parse(`add=${"A,".repeat(5000)}`).add.length).toBeLessThanOrEqual(
      12,
    );
    expect(parse(`px=${"A:1,".repeat(5000)}`).prices).toEqual({});
  });
});

describe("urlQuery", () => {
  it("writes the documented shape, with readable commas and colons", () => {
    expect(
      urlQuery({
        add: ["TT", "WSO"],
        remove: ["HAYW"],
        prices: { LII: "500", CARR: "52.1", "WSO-B": "450" },
        priceDate: "2026-10-28",
      }),
    ).toBe(
      "?add=TT,WSO&remove=HAYW&px=LII:500,CARR:52.1,WSO-B:450&pxdate=2026-10-28",
    );
  });

  it("leaves out empty parts and invalid prices", () => {
    expect(urlQuery({ add: [], remove: [], prices: { LII: "" } })).toBe("");
    expect(
      urlQuery({ add: [], remove: [], prices: { LII: "abc", AAON: "100" } }),
    ).toBe("?px=AAON:100");
  });

  it("round-trips", () => {
    const state = {
      add: ["TT"],
      remove: ["MIDD", "TNC"],
      prices: { LII: "500", "WSO-B": "450.25" },
      priceDate: "2026-10-26",
    };
    expect(parse(urlQuery(state).slice(1))).toEqual(state);
  });
});
