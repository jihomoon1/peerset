import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_EXAMPLE as ex } from "@/lib/homeExample";

const golden = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../../golden/LII-2026Q3.json"),
    "utf8",
  ),
);
const m = golden.metrics.operatingIncome;

describe("home page example", () => {
  it("matches the LII Q3 2026 golden, value for value", () => {
    expect(ex.concept).toBe(m.concept);
    expect(ex.ltm).toBe(m.ltm);
    for (const k of ["fy", "ytdCurrent", "ytdPrior"] as const) {
      expect(ex[k].value).toBe(m.components[k].value);
      expect(ex[k].start).toBe(m.components[k].period.start);
      expect(ex[k].end).toBe(m.components[k].period.end);
    }
    expect(ex.accession).toBe(m.components.ytdCurrent.source.accession);
    expect(ex.filingUrl).toBe(m.components.ytdCurrent.source.url);
  });

  it("adds up: FY + current YTD − prior-year YTD = LTM", () => {
    expect(ex.fy.value + ex.ytdCurrent.value - ex.ytdPrior.value).toBe(ex.ltm);
  });
});
