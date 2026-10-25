import { describe, expect, it } from "vitest";
import {
  InternalError,
  PeerSetError,
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
