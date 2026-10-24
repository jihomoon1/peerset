import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "@/domain/dates";

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

describe("addDays", () => {
  it("moves forward and back across month and leap-year ends", () => {
    expect(addDays("2026-03-31", -730)).toBe("2024-03-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
