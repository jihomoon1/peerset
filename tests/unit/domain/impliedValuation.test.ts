import { describe, expect, it } from "vitest";
import { impliedValuation } from "@/domain/impliedValuation";
import type { MetricStats } from "@/domain/stats";
import type { Metric } from "@/domain/types";

// Implied valuation (methodology §13): target LTM metric × peer 25th percentile,
// median and 75th percentile multiple = implied EV; − debt + cash = implied equity;
// ÷ shares = implied price. Shown only when every target input is valid.

const derived = (value: number): Metric => ({
  status: "derived",
  value,
  unit: "USD",
  period: { kind: "instant", end: "2026-06-30" },
  formula: "test",
  inputs: [],
  warnings: [],
});
const unsupported: Metric = {
  status: "unsupported",
  reason: {
    code: "INPUT_UNSUPPORTED",
    message: "EBITDA needs operating income",
  },
  warnings: [],
};
const stats = (p25: number | null, median: number | null, p75: number | null) =>
  ({
    mean: null,
    high: null,
    low: null,
    p25,
    median,
    p75,
    nValid: p25 === null ? 0 : 4,
    nExcluded: 0,
    used: [],
    excluded: [],
  }) as MetricStats;

const base = {
  revenue: derived(1_000),
  ebitda: derived(200),
  totalDebt: derived(300),
  cash: derived(100),
  shares: [50],
  stats: { evRevenue: stats(2, 3, 4), evEbitda: stats(10, 12, 15) },
};

describe("impliedValuation", () => {
  it("EV/EBITDA: metric × multiple, then − debt + cash, then ÷ shares", () => {
    const r = impliedValuation(base).evEbitda;
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.metricValue).toBe(200);
    // median: 200 × 12 = 2,400 EV; 2,400 − 300 + 100 = 2,200 equity; ÷ 50 = 44
    expect(r.points.median).toEqual({
      multiple: 12,
      impliedEv: 2_400,
      impliedEquity: 2_200,
      impliedPrice: 44,
    });
    // p25: 200 × 10 = 2,000 → 1,800 → 36; p75: 200 × 15 = 3,000 → 2,800 → 56
    expect(r.points.p25.impliedPrice).toBe(36);
    expect(r.points.p75.impliedPrice).toBe(56);
  });

  it("EV/Revenue uses LTM revenue", () => {
    const r = impliedValuation(base).evRevenue;
    // median: 1,000 × 3 = 3,000 → 2,800 → 56
    expect(r.status === "ok" && r.points.median.impliedPrice).toBe(56);
  });

  it("a target metric that isn't valid makes that multiple Unsupported", () => {
    const r = impliedValuation({ ...base, ebitda: unsupported });
    expect(r.evEbitda).toMatchObject({
      status: "unsupported",
      reason: expect.stringMatching(/LTM EBITDA is Unsupported/),
    });
    expect(r.evRevenue.status).toBe("ok");
  });

  it("a target metric ≤ 0 makes that multiple Unsupported", () => {
    expect(
      impliedValuation({ ...base, ebitda: derived(-5) }).evEbitda,
    ).toMatchObject({
      status: "unsupported",
      reason: "LTM EBITDA is not positive",
    });
  });

  it("no valid peer multiple: Unsupported, never 0", () => {
    const r = impliedValuation({
      ...base,
      stats: { ...base.stats, evEbitda: stats(null, null, null) },
    });
    expect(r.evEbitda).toMatchObject({
      status: "unsupported",
      reason: "no peer has a valid EV/EBITDA",
    });
  });

  it("debt, cash or shares not valid: everything Unsupported", () => {
    const missing: Metric = {
      status: "missing",
      reason: "no cash line",
      warnings: [],
    };
    for (const over of [
      { cash: missing },
      { totalDebt: unsupported },
      { shares: [] },
    ]) {
      const r = impliedValuation({ ...base, ...over });
      expect(r.evEbitda.status).toBe("unsupported");
      expect(r.evRevenue.status).toBe("unsupported");
    }
  });

  it("several share classes: Unsupported, one price can't split across classes", () => {
    expect(
      impliedValuation({ ...base, shares: [40, 10] }).evRevenue,
    ).toMatchObject({
      status: "unsupported",
      reason: expect.stringMatching(/several share classes/),
    });
  });
});
