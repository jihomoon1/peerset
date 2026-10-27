import { describe, expect, it } from "vitest";
import { isFinishedTradingDay, nextQuoteRefresh } from "@/lib/marketClock";

// Blueprint §14: quotes are cached until 6 p.m. ET on the next trading day. Weekends
// are skipped; market holidays are not modeled (one extra refresh at worst).

describe("nextQuoteRefresh", () => {
  it.each([
    // [now (UTC), expected cutoff (UTC), cutoff's ET date]
    ["2026-10-26T14:00:00Z", "2026-10-26T22:00:00Z", "2026-10-26"], // Mon 10:00 EDT → Mon 18:00
    ["2026-10-26T22:00:00Z", "2026-10-27T22:00:00Z", "2026-10-27"], // Mon 18:00 EDT exactly → Tue
    ["2026-10-26T23:30:00Z", "2026-10-27T22:00:00Z", "2026-10-27"], // Mon 19:30 EDT → Tue
    ["2026-10-30T23:00:00Z", "2026-11-02T23:00:00Z", "2026-11-02"], // Fri 19:00 EDT → Mon (EST)
    ["2026-10-31T15:00:00Z", "2026-11-02T23:00:00Z", "2026-11-02"], // Sat → Mon 18:00 EST
    ["2026-11-03T03:00:00Z", "2026-11-03T23:00:00Z", "2026-11-03"], // Mon 22:00 EST → Tue
    ["2027-01-01T12:00:00Z", "2027-01-01T23:00:00Z", "2027-01-01"], // a holiday still counts
  ])("%s → %s", (now, cutoff, etDate) => {
    const r = nextQuoteRefresh(new Date(now));
    expect(r.cutoff.toISOString()).toBe(new Date(cutoff).toISOString());
    expect(r.cutoffDate).toBe(etDate);
    expect(r.seconds).toBe(
      Math.ceil((Date.parse(cutoff) - Date.parse(now)) / 1000),
    );
  });
});

describe("isFinishedTradingDay", () => {
  it("an earlier ET date is finished; today is finished from 18:00 ET", () => {
    const now = new Date("2026-10-23T21:59:00.000Z"); // 17:59 ET
    expect(isFinishedTradingDay("2026-10-22", now)).toBe(true);
    expect(isFinishedTradingDay("2026-10-23", now)).toBe(false);
    expect(
      isFinishedTradingDay("2026-10-23", new Date("2026-10-23T22:00:00.000Z")),
    ).toBe(true);
    expect(isFinishedTradingDay("2026-10-24", now)).toBe(false);
  });
});
