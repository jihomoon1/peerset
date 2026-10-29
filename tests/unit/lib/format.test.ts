import { describe, expect, it } from "vitest";
import {
  formatMultiple,
  formatPrice,
  formatShares,
  formatTimestamp,
  formatDate,
  formatMillions,
  formatPercent,
  formatPerShare,
  formatExactAmount,
  formatRatioX,
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

  it("shows <0.1 for a nonzero value that would round to 0.0 (AAON cash, $13,000)", () => {
    expect(formatMillions(13_000)).toBe("<0.1");
    expect(formatMillions(-13_000)).toBe("(<0.1)");
    expect(formatMillions(1)).toBe("<0.1");
  });

  it("keeps exact zero as 0.0, and 0.1 once the value rounds up to it", () => {
    expect(formatMillions(0)).toBe("0.0");
    expect(formatMillions(50_000)).toBe("0.1");
  });

  it("applies the same rule at more decimals", () => {
    expect(formatMillions(400, 3)).toBe("<0.001");
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

describe("formatMultiple", () => {
  it("shows one decimal and an x (blueprint §6)", () => {
    expect(formatMultiple(16.146911)).toBe("16.1x");
    expect(formatMultiple(3.5475)).toBe("3.5x");
    expect(formatMultiple(100)).toBe("100.0x");
  });
});

describe("formatPrice", () => {
  it("shows dollars with two decimals and thousands separators", () => {
    expect(formatPrice(500)).toBe("500.00");
    expect(formatPrice(1234.5)).toBe("1,234.50");
  });
});

describe("formatShares", () => {
  it("shows whole shares with separators", () => {
    expect(formatShares(34_560_675)).toBe("34,560,675");
  });
});

describe("formatTimestamp", () => {
  it("writes an ISO timestamp as Month D, YYYY, HH:MM UTC", () => {
    expect(formatTimestamp("2026-10-26T14:05:09.123Z")).toBe(
      "October 26, 2026, 14:05 UTC",
    );
  });
});

describe("formatExactAmount", () => {
  it("shows dollars and shares in full units", () => {
    expect(formatExactAmount(13_000, "USD")).toBe("$13,000");
    expect(formatExactAmount(-13_000, "USD")).toBe("($13,000)");
    expect(formatExactAmount(42_000, "shares")).toBe("42,000 shares");
  });
});

describe("formatRatioX", () => {
  it("shows a size ratio with one decimal and an x", () => {
    expect(formatRatioX(0.6)).toBe("0.6x");
    expect(formatRatioX(5.0001)).toBe("5.0x");
    expect(formatRatioX(0.03)).toBe("<0.1x");
    expect(formatRatioX(0)).toBe("0.0x");
  });
});
