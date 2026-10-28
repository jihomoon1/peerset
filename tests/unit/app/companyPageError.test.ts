import { describe, expect, it } from "vitest";
import { pageErrorOutcome } from "@/app/c/[ticker]/pageError";
import {
  SecUnavailableError,
  TickerNotFoundError,
  UnsupportedIssuerError,
} from "@/lib/errors";

describe("pageErrorOutcome", () => {
  it("answers 404 for an unknown ticker", () => {
    expect(pageErrorOutcome(new TickerNotFoundError("ZZZZZ"), "r1")).toEqual({
      notFound: true,
      body: expect.objectContaining({ code: "TICKER_NOT_FOUND" }),
    });
  });

  it("answers 404 for an unsupported company, keeping its reason", () => {
    const out = pageErrorOutcome(
      new UnsupportedIssuerError(
        "Financial company (SIC 6021)",
        "FINANCIAL_SIC",
      ),
      "r2",
    );
    expect(out.notFound).toBe(true);
    expect(out.body.message).toBe("Financial company (SIC 6021)");
  });

  it("keeps other failures on the page as an error state", () => {
    expect(
      pageErrorOutcome(new SecUnavailableError("timeout"), "r3").notFound,
    ).toBe(false);
  });
});
