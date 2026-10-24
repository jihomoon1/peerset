import { describe, expect, it } from "vitest";
import { daysBetween } from "@/domain/dates";

describe("daysBetween", () => {
  it("counts whole days, signed", () => {
    expect(daysBetween("2026-04-05", "2026-10-22")).toBe(200);
    expect(daysBetween("2026-10-22", "2026-04-05")).toBe(-200);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // leap year
  });

  it("rejects non-ISO input", () => {
    expect(() => daysBetween("10/22/2026", "2026-10-22")).toThrow(RangeError);
  });
});
