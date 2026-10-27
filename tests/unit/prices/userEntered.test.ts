import { describe, expect, it } from "vitest";
import { userQuote } from "@/prices/userEntered";

// Blueprint §13: price > 0 and < 1,000,000; the date a real ISO date, not after the
// analysis date. Pure, so the browser runs the same check.

const base = {
  symbol: "LII",
  analysisDate: "2026-10-26",
  retrievedAt: "2026-10-26T14:00:00.000Z",
};

describe("userQuote", () => {
  it("builds a user-entered snapshot", () => {
    expect(userQuote({ ...base, close: 500, asOfDate: "2026-10-23" })).toEqual({
      kind: "ok",
      quote: {
        symbol: "LII",
        close: 500,
        currency: "USD",
        asOfDate: "2026-10-23",
        source: "user_entered",
        retrievedAt: "2026-10-26T14:00:00.000Z",
      },
    });
  });

  it.each([
    [0, "Price must be above 0"],
    [-1, "Price must be above 0"],
    [1_000_000, "Price must be below 1,000,000"],
    [Number.NaN, "Price must be a number"],
    [Number.POSITIVE_INFINITY, "Price must be a number"],
  ])("rejects price %s", (close, message) => {
    expect(userQuote({ ...base, close, asOfDate: "2026-10-23" })).toEqual({
      kind: "invalid",
      message,
    });
  });

  it("accepts a price just under the cap", () => {
    expect(
      userQuote({ ...base, close: 999_999.99, asOfDate: "2026-10-23" }).kind,
    ).toBe("ok");
  });

  it.each(["2026-02-30", "2026-13-01", "10/23/2026", "", "2026-1-5"])(
    "rejects %j as a date",
    (asOfDate) => {
      expect(userQuote({ ...base, close: 500, asOfDate })).toEqual({
        kind: "invalid",
        message: "Price date must be a real date (YYYY-MM-DD)",
      });
    },
  );

  it("rejects a price date after the analysis date", () => {
    expect(userQuote({ ...base, close: 500, asOfDate: "2026-10-27" })).toEqual({
      kind: "invalid",
      message: "Price date can't be after the analysis date (2026-10-26)",
    });
  });

  it("accepts a price dated on the analysis date", () => {
    expect(
      userQuote({ ...base, close: 500, asOfDate: "2026-10-26" }).kind,
    ).toBe("ok");
  });

  it("uppercases and trims the symbol", () => {
    const r = userQuote({
      ...base,
      symbol: " wso-b ",
      close: 450,
      asOfDate: "2026-10-23",
    });
    expect(r.kind === "ok" && r.quote.symbol).toBe("WSO-B");
  });
});
