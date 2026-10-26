import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMillions,
  formatPercent,
  formatPerShare,
} from "@/lib/format";

describe("formatMillions", () => {
  it("shows full units as millions with one decimal and thousands separators", () => {
    expect(formatMillions(1_581_300_000)).toBe("1,581.3");
    expect(formatMillions(600_000)).toBe("0.6");
  });

  it("puts negatives in parentheses", () => {
    expect(formatMillions(-58_600_000)).toBe("(58.6)");
  });

  it("can show more decimals", () => {
    expect(formatMillions(34_560_675, 3)).toBe("34.561");
  });
});

describe("formatPerShare", () => {
  it("shows dollars per share to two decimals, negatives in parentheses", () => {
    expect(formatPerShare(22.509999999999998)).toBe("22.51");
    expect(formatPerShare(-1.234)).toBe("(1.23)");
    expect(formatPerShare(1234.5)).toBe("1,234.50");
  });
});

describe("formatPercent", () => {
  it("shows a ratio as a percentage to one decimal, negatives in parentheses", () => {
    expect(formatPercent(0.2197012560823809)).toBe("22.0%");
    expect(formatPercent(-0.053)).toBe("(5.3%)");
  });
});

describe("formatDate", () => {
  it("writes an ISO date as Month D, YYYY", () => {
    expect(formatDate("2026-07-29")).toBe("July 29, 2026");
    expect(formatDate("2026-01-05")).toBe("January 5, 2026");
  });
});
