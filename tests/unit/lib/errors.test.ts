import { describe, expect, it } from "vitest";
import {
  errorResponseBody,
  httpStatusFor,
  InternalError,
  InvalidInputError,
  PeerSetError,
  PriceRateLimitedError,
  PriceUnavailableError,
  SecRateLimitedError,
  SecSchemaChangedError,
  SecUnavailableError,
  TickerNotFoundError,
  UnsupportedIssuerError,
} from "@/lib/errors";

describe("error classes (blueprint §15)", () => {
  it.each([
    [new TickerNotFoundError("XYZ"), "TICKER_NOT_FOUND", false],
    [
      new UnsupportedIssuerError("files 20-F reports"),
      "UNSUPPORTED_ISSUER",
      false,
    ],
    [new SecUnavailableError("503 after 2 retries"), "SEC_UNAVAILABLE", true],
    [new SecRateLimitedError("403 rate threshold"), "SEC_RATE_LIMITED", true],
    [
      new SecSchemaChangedError("submissions: filings.recent"),
      "SEC_SCHEMA_CHANGED",
      false,
    ],
    [new InternalError("bug"), "INTERNAL", false],
    [
      new PriceUnavailableError("Error Message: invalid call"),
      "PRICE_UNAVAILABLE",
      true,
    ],
    [
      new PriceRateLimitedError("Information: rate limit"),
      "PRICE_RATE_LIMITED",
      true,
    ],
  ] as const)("%s has code, user message, detail", (err, code, retryable) => {
    expect(err).toBeInstanceOf(PeerSetError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(code);
    expect(err.userMessage.length).toBeGreaterThan(0);
    expect(err.retryable).toBe(retryable);
    expect(typeof err.detail).toBe("string");
  });

  it("puts the ticker into the not-found user message", () => {
    expect(new TickerNotFoundError("XYZ").userMessage).toBe(
      "No SEC-registered company uses XYZ",
    );
  });

  it("uses the unsupported reason as the user message", () => {
    expect(new UnsupportedIssuerError("files 20-F reports").userMessage).toBe(
      "files 20-F reports",
    );
  });

  it("keeps detail out of the user message", () => {
    const err = new SecSchemaChangedError("companyfacts: facts.us-gaap");
    expect(err.userMessage).not.toContain("facts.us-gaap");
    expect(err.message).toContain("facts.us-gaap");
  });
});

describe("HTTP mapping (blueprint §15)", () => {
  it.each([
    [new InvalidInputError("ticker is required"), 400],
    [new TickerNotFoundError("XYZ"), 404],
    [new UnsupportedIssuerError("files 20-F reports"), 422],
    [new SecRateLimitedError("403"), 429],
    [new SecSchemaChangedError("x"), 502],
    [new SecUnavailableError("503"), 503],
    [new InternalError("bug"), 500],
    [new PriceUnavailableError("x"), 502],
    [new PriceRateLimitedError("x"), 429],
  ] as const)("%s → %i", (err, status) => {
    expect(httpStatusFor(err)).toBe(status);
  });

  it("price errors tell the user to enter the price by hand", () => {
    expect(new PriceUnavailableError("x").userMessage).toBe(
      "The price provider didn't return a price; enter it by hand",
    );
    expect(new PriceRateLimitedError("x").userMessage).toBe(
      "The price provider's daily limit is reached; enter the price by hand or try tomorrow",
    );
  });

  it("an invalid input says what is wrong and is not retryable", () => {
    const err = new InvalidInputError("Ticker must be 1–10 letters");
    expect(err).toMatchObject({ code: "INVALID_INPUT", retryable: false });
    expect(err.userMessage).toBe("Ticker must be 1–10 letters");
  });

  it("the response body holds only the code, user message and request ID", () => {
    const err = new SecUnavailableError("timeout: data.sec.gov/secret-detail");
    const body = errorResponseBody(err, "req-1");
    expect(body).toEqual({
      code: "SEC_UNAVAILABLE",
      message: "SEC didn't respond; try again later",
      retryable: true,
      requestId: "req-1",
    });
    expect(JSON.stringify(body)).not.toContain("secret-detail");
  });

  it("an unknown thrown value becomes INTERNAL without its message", () => {
    const body = errorResponseBody(
      new TypeError("x is undefined at foo.ts:3"),
      "r",
    );
    expect(body.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("foo.ts");
    expect(httpStatusFor(new TypeError("x"))).toBe(500);
  });
});
