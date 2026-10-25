import { describe, expect, it } from "vitest";
import { formatMillions } from "@/lib/format";

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
