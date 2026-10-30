import { describe, expect, it } from "vitest";
import { percentileInc, summarize, type StatEntry } from "@/domain/stats";
import type { Metric } from "@/domain/types";

// Methodology §11: peers only; mean, median, high, low, 25th and 75th percentile
// (Excel PERCENTILE.INC: linear interpolation, inclusive); n valid and n excluded.
// NM, Missing ("—") and Unsupported never enter a statistic.

const value = (v: number): Metric => ({
  status: "derived",
  value: v,
  unit: "multiple",
  period: { kind: "instant", end: "2026-06-30" },
  formula: "test",
  inputs: [],
  warnings: [],
});
const nm = (v: number | null = -3): Metric => ({
  status: "nm",
  value: v,
  reason: "EBITDA_NOT_POSITIVE",
  inputs: [],
  warnings: [],
});
const missing: Metric = {
  status: "missing",
  reason: "needs price",
  warnings: [],
};
const unsupported: Metric = {
  status: "unsupported",
  reason: { code: "INPUT_UNSUPPORTED", message: "EBITDA is unsupported" },
  warnings: [],
};

const entries = (...vs: (number | Metric)[]): StatEntry[] =>
  vs.map((v, i) => ({
    ticker: `P${i + 1}`,
    input:
      typeof v === "number"
        ? { kind: "metric", metric: value(v) }
        : { kind: "metric", metric: v },
  }));

describe("percentileInc (Excel PERCENTILE.INC)", () => {
  // rank = (n − 1) × p; interpolate between the two neighbouring sorted values.
  it.each([
    // {1,2,3,4}: p25 rank 0.75 → 1 + 0.75 × (2 − 1) = 1.75; p75 rank 2.25 → 3.25
    [[1, 2, 3, 4], 0.25, 1.75],
    [[1, 2, 3, 4], 0.75, 3.25],
    [[1, 2, 3, 4], 0.5, 2.5],
    // {10,20,30,40,50}: p25 rank 1 → 20 exactly; p75 rank 3 → 40
    [[10, 20, 30, 40, 50], 0.25, 20],
    [[10, 20, 30, 40, 50], 0.75, 40],
    // {8.2,11.5,16.1}: p25 rank 0.5 → 8.2 + 0.5 × 3.3 = 9.85; p75 rank 1.5 → 13.8
    [[8.2, 11.5, 16.1], 0.25, 9.85],
    [[8.2, 11.5, 16.1], 0.75, 13.8],
    [[7], 0.25, 7],
    [[7], 0.75, 7],
    [[3, 9], 0, 3],
    [[3, 9], 1, 9],
  ])("%j at p=%d is %d", (sorted, p, expected) => {
    expect(percentileInc(sorted, p)).toBeCloseTo(expected, 10);
  });

  it("has no value for an empty list", () => {
    expect(percentileInc([], 0.5)).toBeNull();
  });
});

describe("summarize", () => {
  it("odd n: the median is the middle value", () => {
    const s = summarize(entries(16.1, 8.2, 11.5));
    expect(s).toMatchObject({
      nValid: 3,
      nExcluded: 0,
      high: 16.1,
      low: 8.2,
      median: 11.5,
    });
    // (16.1 + 8.2 + 11.5) ÷ 3 = 35.8 ÷ 3 = 11.9333…
    expect(s.mean).toBeCloseTo(35.8 / 3, 10);
    expect(s.p25).toBeCloseTo(9.85, 10);
    expect(s.p75).toBeCloseTo(13.8, 10);
  });

  it("even n: the median is the average of the middle two", () => {
    const s = summarize(entries(4, 1, 3, 2));
    expect(s.median).toBe(2.5);
    expect(s.mean).toBe(2.5);
    expect(s.p25).toBeCloseTo(1.75, 10);
    expect(s.p75).toBeCloseTo(3.25, 10);
  });

  it("n = 1: every statistic is that value", () => {
    const s = summarize(entries(12.4));
    expect(s).toMatchObject({
      nValid: 1,
      mean: 12.4,
      median: 12.4,
      high: 12.4,
      low: 12.4,
      p25: 12.4,
      p75: 12.4,
    });
  });

  it("n = 0: statistics are absent, never zero", () => {
    const s = summarize([]);
    expect(s).toMatchObject({
      nValid: 0,
      nExcluded: 0,
      mean: null,
      median: null,
      high: null,
      low: null,
      p25: null,
      p75: null,
    });
  });

  it("all NM: nothing valid, every peer excluded with its reason", () => {
    const s = summarize(entries(nm(), nm(null), nm(150)));
    expect(s.nValid).toBe(0);
    expect(s.nExcluded).toBe(3);
    expect(s.mean).toBeNull();
    expect(s.excluded.map((e) => e.status)).toEqual(["nm", "nm", "nm"]);
    expect(s.excluded[0].reason).toBe("EBITDA ≤ 0");
  });

  it("a mix of statuses: only reported and derived values enter", () => {
    const s = summarize([
      ...entries(10, nm(), missing, unsupported, 20),
      { ticker: "FAIL", input: { kind: "failed", reason: "SEC unavailable" } },
    ]);
    expect(s.nValid).toBe(2);
    expect(s.nExcluded).toBe(4);
    expect(s.mean).toBe(15);
    expect(s.used.map((u) => [u.ticker, u.value])).toEqual([
      ["P1", 10],
      ["P5", 20],
    ]);
    expect(s.excluded).toEqual([
      { ticker: "P2", status: "nm", reason: "EBITDA ≤ 0" },
      { ticker: "P3", status: "missing", reason: "needs price" },
      { ticker: "P4", status: "unsupported", reason: "EBITDA is unsupported" },
      {
        ticker: "FAIL",
        status: "failed",
        reason: "failed to load: SEC unavailable",
      },
    ]);
  });

  it("a NM ratio's raw value never enters, even when it is a number", () => {
    const s = summarize(entries(10, nm(150)));
    expect(s.high).toBe(10);
  });
});
