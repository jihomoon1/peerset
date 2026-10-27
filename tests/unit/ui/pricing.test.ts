import { describe, expect, it } from "vitest";
import type { Metric, QuoteSnapshot } from "@/domain/types";
import {
  displayValuationCell,
  parsePastedPrices,
  providerPriceDate,
  quotesFromInputs,
} from "@/ui/pricing";

describe("parsePastedPrices", () => {
  const tickers = ["WSO", "WSO-B"];

  it("reads 'ticker, price' lines and matches any spelling", () => {
    expect(parsePastedPrices("WSO, 450.00\nwso.b,451.25\n", tickers)).toEqual({
      prices: { WSO: "450.00", "WSO-B": "451.25" },
      unmatched: [],
    });
  });

  it("accepts tabs, spaces, a $ sign and thousands separators", () => {
    expect(
      parsePastedPrices("WSO\t$1,450.5\nWSOB   452", tickers).prices,
    ).toEqual({ WSO: "1450.5", "WSO-B": "452" });
  });

  it("reports lines it can't use, and skips blank lines", () => {
    expect(
      parsePastedPrices("\nLII, 500\nWSO\nhello world\n", tickers),
    ).toEqual({
      prices: {},
      unmatched: ["LII, 500", "WSO", "hello world"],
    });
  });
});

describe("quotesFromInputs", () => {
  const base = {
    priceDate: "2026-10-23",
    analysisDate: "2026-10-26",
    retrievedAt: "2026-10-26T14:00:00.000Z",
    providerQuotes: [] as QuoteSnapshot[],
  };

  it("turns valid inputs into user-entered quotes, skipping blanks", () => {
    const r = quotesFromInputs({
      ...base,
      inputs: { WSO: "450", "WSO-B": "" },
    });
    expect(r.quotes).toEqual([
      {
        symbol: "WSO",
        close: 450,
        currency: "USD",
        asOfDate: "2026-10-23",
        source: "user_entered",
        retrievedAt: "2026-10-26T14:00:00.000Z",
      },
    ]);
    expect(r.errors).toEqual({});
  });

  it("explains an invalid price next to its input", () => {
    const r = quotesFromInputs({ ...base, inputs: { WSO: "abc" } });
    expect(r.quotes).toEqual([]);
    expect(r.errors).toEqual({ WSO: "Price must be a number" });
  });

  it("a bad date is one error for the date, not per price", () => {
    const r = quotesFromInputs({
      ...base,
      priceDate: "2026-10-27",
      inputs: { WSO: "450", "WSO-B": "450" },
    });
    expect(r.quotes).toEqual([]);
    expect(r.dateError).toBe(
      "Price date can't be after the analysis date (2026-10-26)",
    );
    expect(r.errors).toEqual({});
  });

  it("keeps a provider quote while its price and date are unchanged", () => {
    const av: QuoteSnapshot = {
      symbol: "LII",
      close: 376.01,
      currency: "USD",
      asOfDate: "2026-10-23",
      source: "alpha_vantage",
      retrievedAt: "2026-10-26T13:00:00.000Z",
    };
    expect(
      quotesFromInputs({
        ...base,
        providerQuotes: [av],
        inputs: { LII: "376.01" },
      }).quotes,
    ).toEqual([av]);
    expect(
      quotesFromInputs({
        ...base,
        providerQuotes: [av],
        inputs: { LII: "380" },
      }).quotes[0].source,
    ).toBe("user_entered");
  });
});

describe("displayValuationCell", () => {
  const missing: Metric = {
    status: "missing",
    reason: "price needed for LII",
    warnings: [],
  };

  it("says 'Needs price' while a price is missing", () => {
    expect(displayValuationCell(missing, "multiple", ["LII"])).toEqual({
      text: "Needs price",
      kind: "needs-price",
      note: "price needed for LII",
    });
  });

  it("shows '—' for a missing input once every price is in", () => {
    expect(displayValuationCell(missing, "multiple", [])).toMatchObject({
      text: "—",
      kind: "missing",
    });
  });

  it("formats multiples and money", () => {
    const m = (value: number, unit: "USD" | "multiple"): Metric => ({
      status: "derived",
      value,
      unit,
      period: { kind: "instant", end: "2026-10-23" },
      formula: "",
      inputs: [],
      warnings: [],
    });
    expect(
      displayValuationCell(m(16.1469, "multiple"), "multiple", []).text,
    ).toBe("16.1x");
    expect(displayValuationCell(m(17_280_337_500, "USD"), "USD", []).text).toBe(
      "17,280.3",
    );
  });

  it("NM carries its reason in words", () => {
    expect(
      displayValuationCell(
        {
          status: "nm",
          value: 188.1,
          reason: "ABOVE_CAP",
          inputs: [],
          warnings: [],
        },
        "multiple",
        [],
      ),
    ).toEqual({
      text: "NM",
      kind: "nm",
      note: "NM: above 100x policy (188.1x)",
    });
  });
});

describe("quotesFromInputs with provider quotes of different dates", () => {
  const av = (
    symbol: string,
    close: number,
    asOfDate: string,
  ): QuoteSnapshot => ({
    symbol,
    close,
    currency: "USD",
    asOfDate,
    source: "alpha_vantage",
    retrievedAt: "2026-10-26T13:00:00.000Z",
  });
  const providerQuotes = [
    av("WSO", 322.98, "2026-10-23"),
    av("WSO-B", 287.5, "2026-10-21"),
  ];

  it("the default price date is the earliest provider date", () => {
    expect(providerPriceDate(providerQuotes)).toBe("2026-10-21");
    expect(providerPriceDate([])).toBeUndefined();
  });

  it("untouched pre-fills keep each class's own date and source", () => {
    const r = quotesFromInputs({
      priceDate: "2026-10-21",
      analysisDate: "2026-10-26",
      retrievedAt: "2026-10-26T14:00:00.000Z",
      providerQuotes,
      inputs: { WSO: "322.98", "WSO-B": "287.50" },
    });
    expect(r.quotes).toEqual(providerQuotes);
  });

  it("an edited date makes every price user-entered on that date", () => {
    const r = quotesFromInputs({
      priceDate: "2026-10-22",
      analysisDate: "2026-10-26",
      retrievedAt: "2026-10-26T14:00:00.000Z",
      providerQuotes,
      inputs: { WSO: "322.98", "WSO-B": "287.50" },
    });
    expect(r.quotes.map((q) => [q.source, q.asOfDate])).toEqual([
      ["user_entered", "2026-10-22"],
      ["user_entered", "2026-10-22"],
    ]);
  });
});
