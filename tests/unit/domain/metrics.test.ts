import { describe, expect, it } from "vitest";
import type { LtmInput } from "@/domain/ltm";
import { computeRevenue } from "@/domain/metrics/revenue";
import { computeOperatingIncome } from "@/domain/metrics/operatingIncome";
import { computeDa } from "@/domain/metrics/da";
import { computeEbitda } from "@/domain/metrics/ebitda";
import { computeEbitdaMargin } from "@/domain/metrics/ebitdaMargin";
import { computeNetIncome } from "@/domain/metrics/netIncome";
import { computeEps, isSplitLike } from "@/domain/metrics/eps";
import type { Metric, ReportedFinancialFact } from "@/domain/types";
import { fact, filing } from "../../helpers/facts";

// A synthetic December year-end company after its Q2 10-Q. For every concept c the
// facts are FY2025, 6M 2026 and 6M 2025, so LTM = FY + YTD − prior YTD.

const k25 = filing("0000000001-26-000010", "10-K", "2026-02-15", "2025-12-31");
const q2 = filing("0000000001-26-000050", "10-Q", "2026-07-28", "2026-06-30");
const q2Of2025 = filing(
  "0000000001-25-000050",
  "10-Q",
  "2025-07-28",
  "2025-06-30",
);

type Unit = ReportedFinancialFact["unit"];
function series(
  concept: string,
  [fy, ytd, prior]: [number, number, number],
  unit: Unit = "USD",
): ReportedFinancialFact[] {
  return [
    fact({
      concept,
      value: fy,
      start: "2025-01-01",
      end: "2025-12-31",
      filing: k25,
      unit,
    }),
    fact({
      concept,
      value: ytd,
      start: "2026-01-01",
      end: "2026-06-30",
      filing: q2,
      unit,
    }),
    fact({
      concept,
      value: prior,
      start: "2025-01-01",
      end: "2025-06-30",
      filing: q2,
      unit,
    }),
  ];
}

const at = (facts: ReportedFinancialFact[]): LtmInput => ({
  facts,
  ltmEnd: "2026-06-30",
  latestForm: "10-Q",
  freshness: "current",
});

function usable(m: Metric) {
  if (m.status !== "reported" && m.status !== "derived")
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m;
}

const REV_X = "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax";
const REVS = "us-gaap:Revenues";

describe("revenue (§3)", () => {
  it("uses the highest-priority concept and lists its three facts as inputs", () => {
    const { metric, ltm } = computeRevenue(at(series(REVS, [1000, 530, 495])));
    const m = usable(metric);
    expect(m.value).toBe(1035);
    expect(m.status).toBe("derived");
    expect(m.unit).toBe("USD");
    expect(m.inputs).toHaveLength(3);
    expect(ltm?.concept).toBe(REVS);
    expect(m.formula).toContain("FY + current YTD − prior-year YTD");
  });

  it("is reported, not derived, after a 10-K", () => {
    const { metric } = computeRevenue({
      ...at(series(REVS, [1000, 530, 495]).slice(0, 1)),
      ltmEnd: "2025-12-31",
      latestForm: "10-K",
    });
    expect(metric).toMatchObject({ status: "reported", value: 1000 });
  });

  it("two concepts disagree and Revenues is larger: uses Revenues, warns, shows both", () => {
    const facts = [
      ...series(REV_X, [900, 480, 450]),
      ...series(REVS, [1000, 530, 495]),
    ];
    const { metric, ltm } = computeRevenue(at(facts));
    const m = usable(metric);
    expect(m.value).toBe(1035);
    expect(ltm?.concept).toBe(REVS);
    expect(m.inputs).toHaveLength(6);
    const w = m.warnings.find((x) => x.code === "W_REVENUE_CONCEPTS_DIFFER");
    expect(w?.message).toContain("930"); // the other concept's LTM, 900 + 480 − 450
    expect(w?.message).toContain("1,035");
  });

  it("two concepts disagree and Revenues is smaller: keeps the priority concept, warns", () => {
    const facts = [
      ...series(REV_X, [1000, 530, 495]),
      ...series(REVS, [900, 480, 450]),
    ];
    const { metric, ltm } = computeRevenue(at(facts));
    expect(usable(metric).value).toBe(1035);
    expect(ltm?.concept).toBe(REV_X);
    expect(metric.warnings.map((w) => w.code)).toContain(
      "W_REVENUE_CONCEPTS_DIFFER",
    );
  });

  it("two concepts that agree: no warning", () => {
    const facts = [
      ...series(REV_X, [1000, 530, 495]),
      ...series(REVS, [1000, 530, 495]),
    ];
    const { metric } = computeRevenue(at(facts));
    expect(metric.warnings).toEqual([]);
    expect(usable(metric).inputs).toHaveLength(3);
  });

  it("no revenue concept: Unsupported, never zero", () => {
    const { metric } = computeRevenue(at([]));
    expect(metric).toMatchObject({
      status: "unsupported",
      reason: { code: "NO_CONCEPT_WITH_ALL_COMPONENTS" },
    });
  });
});

describe("operating income (§3: no fallback)", () => {
  it("computes LTM from OperatingIncomeLoss", () => {
    const facts = series("us-gaap:OperatingIncomeLoss", [200, 110, 100]);
    expect(usable(computeOperatingIncome(at(facts)).metric).value).toBe(210);
  });

  it("does not fall back to any other concept", () => {
    const facts = series(
      "us-gaap:IncomeLossFromContinuingOperations",
      [1, 1, 1],
    );
    expect(computeOperatingIncome(at(facts)).metric.status).toBe("unsupported");
  });
});

describe("D&A (§3)", () => {
  it("always warns that it comes from the cash-flow statement", () => {
    const facts = series("us-gaap:DepreciationAndAmortization", [50, 26, 25]);
    const { metric } = computeDa(at(facts));
    expect(usable(metric).value).toBe(51);
    expect(metric.warnings.map((w) => w.code)).toContain("W_DA_FROM_CASH_FLOW");
  });

  it("falls back to Depreciation + AmortizationOfIntangibleAssets over the same periods", () => {
    const facts = [
      ...series("us-gaap:Depreciation", [40, 21, 20]),
      ...series("us-gaap:AmortizationOfIntangibleAssets", [10, 5, 5]),
    ];
    const { metric, ltmParts } = computeDa(at(facts));
    const m = usable(metric);
    expect(m.value).toBe(41 + 10);
    expect(m.status).toBe("derived");
    expect(m.inputs).toHaveLength(6);
    expect(ltmParts.map((p) => p.concept)).toEqual([
      "us-gaap:Depreciation",
      "us-gaap:AmortizationOfIntangibleAssets",
    ]);
  });

  it("the pair needs both lines: depreciation alone is Unsupported", () => {
    const facts = series("us-gaap:Depreciation", [40, 21, 20]);
    expect(computeDa(at(facts)).metric.status).toBe("unsupported");
  });
});

describe("EBITDA and margin (§4)", () => {
  const facts = [
    ...series(REVS, [1000, 530, 495]),
    ...series("us-gaap:OperatingIncomeLoss", [200, 110, 100]),
    ...series("us-gaap:DepreciationAndAmortization", [50, 26, 25]),
  ];
  const revenue = computeRevenue(at(facts)).metric;
  const oi = computeOperatingIncome(at(facts)).metric;
  const da = computeDa(at(facts)).metric;

  it("EBITDA = operating income + D&A, derived, with both as inputs", () => {
    const m = usable(computeEbitda(oi, da));
    expect(m.value).toBe(210 + 51);
    expect(m.status).toBe("derived");
    expect(m.formula).toBe("Operating income + D&A");
    expect(m.inputs).toEqual([
      { metric: "operatingIncome", value: 210 },
      { metric: "da", value: 51 },
    ]);
    expect(m.warnings.map((w) => w.code)).toContain("W_DA_FROM_CASH_FLOW");
  });

  it("an Unsupported input makes EBITDA Unsupported, naming it", () => {
    const m = computeEbitda(computeOperatingIncome(at([])).metric, da);
    expect(m).toMatchObject({
      status: "unsupported",
      reason: { code: "INPUT_UNSUPPORTED" },
    });
    if (m.status === "unsupported")
      expect(m.reason.message).toContain("operating income");
  });

  it("a Missing input makes EBITDA Missing, never zero", () => {
    const m = computeEbitda(
      { status: "missing", reason: "x", warnings: [] },
      da,
    );
    expect(m.status).toBe("missing");
  });

  it("inputs over different periods make EBITDA Unsupported", () => {
    const shifted = usable(da);
    const m = computeEbitda(oi, {
      ...shifted,
      period: { ...shifted.period, start: "2025-04-01" },
    });
    expect(m.status).toBe("unsupported");
  });

  it("margin = EBITDA ÷ revenue as a ratio", () => {
    const m = usable(computeEbitdaMargin(computeEbitda(oi, da), revenue));
    expect(m.value).toBeCloseTo(261 / 1035, 12);
    expect(m.unit).toBe("ratio");
  });

  it("margin is shown even when EBITDA is negative", () => {
    const loss = [
      ...series(REVS, [1000, 530, 495]),
      ...series("us-gaap:OperatingIncomeLoss", [-300, -150, -140]),
      ...series("us-gaap:DepreciationAndAmortization", [50, 26, 25]),
    ];
    const ebitda = computeEbitda(
      computeOperatingIncome(at(loss)).metric,
      computeDa(at(loss)).metric,
    );
    const m = usable(
      computeEbitdaMargin(ebitda, computeRevenue(at(loss)).metric),
    );
    expect(m.value).toBeCloseTo((-310 + 51) / 1035, 12);
  });

  it("margin with revenue ≤ 0 is Unsupported, never a division by zero", () => {
    const zero = computeRevenue(at(series(REVS, [0, 0, 0]))).metric;
    expect(computeEbitdaMargin(computeEbitda(oi, da), zero).status).toBe(
      "unsupported",
    );
  });
});

describe("net income (§3)", () => {
  it("computes LTM from NetIncomeLoss", () => {
    const facts = series("us-gaap:NetIncomeLoss", [150, 80, 70]);
    expect(usable(computeNetIncome(at(facts)).metric).value).toBe(160);
  });
});

describe("diluted EPS (§5)", () => {
  const EPS = "us-gaap:EarningsPerShareDiluted";
  const SH = "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding";
  const NI = "us-gaap:NetIncomeLoss";
  const base = [
    ...series(EPS, [4.0, 2.2, 2.0], "USD/shares"),
    ...series(NI, [400, 220, 200]),
    fact({
      concept: SH,
      value: 100,
      start: "2025-01-01",
      end: "2025-12-31",
      filing: k25,
      unit: "shares",
    }),
  ];
  const ni = (facts: ReportedFinancialFact[]) =>
    computeNetIncome(at(facts)).metric;

  it("LTM EPS = FY + YTD − prior YTD from reported EPS facts", () => {
    const r = computeEps(at(base), ni(base));
    const m = usable(r.metric);
    expect(m.value).toBeCloseTo(4.2, 10);
    expect(m.unit).toBe("USD/shares");
    expect(r.crossCheck).toMatchObject({ status: "checked" });
    expect(m.warnings.map((w) => w.code)).not.toContain("W_EPS_CROSSCHECK");
  });

  it("warns when EPS differs from LTM net income ÷ FY diluted shares by more than 5%", () => {
    const facts = [
      ...base.filter((f) => f.concept !== SH),
      fact({
        concept: SH,
        value: 90,
        start: "2025-01-01",
        end: "2025-12-31",
        filing: k25,
        unit: "shares",
      }),
    ]; // 420 / 90 = 4.67 vs 4.20: an 11% gap
    const r = computeEps(at(facts), ni(facts));
    expect(r.metric.warnings).toContainEqual(
      expect.objectContaining({
        code: "W_EPS_CROSSCHECK",
        severity: "caution",
      }),
    );
    expect(usable(r.metric).value).toBeCloseTo(4.2, 10); // a warning, not a suppression
  });

  it("skips the cross-check, saying why, when diluted shares are missing", () => {
    const facts = base.filter((f) => f.concept !== SH);
    const r = computeEps(at(facts), ni(facts));
    expect(r.crossCheck).toMatchObject({ status: "skipped" });
    expect(r.metric.warnings.map((w) => w.code)).not.toContain(
      "W_EPS_CROSSCHECK",
    );
  });

  it("no split: restated prior YTD close to the original", () => {
    const facts = [
      ...base,
      fact({
        concept: EPS,
        value: 1.95,
        start: "2025-01-01",
        end: "2025-06-30",
        filing: q2Of2025,
        unit: "USD/shares",
      }),
    ];
    expect(computeEps(at(facts), ni(facts)).splitSinceLastAnnual).toBe(false);
  });

  it("split: originally filed prior YTD is 2x the restated one", () => {
    const facts = [
      ...base,
      fact({
        concept: EPS,
        value: 4.0,
        start: "2025-01-01",
        end: "2025-06-30",
        filing: q2Of2025,
        unit: "USD/shares",
      }),
    ];
    const r = computeEps(at(facts), ni(facts));
    expect(r.splitSinceLastAnnual).toBe(true);
    expect(r.splitEvidence).toContain("2.00");
  });

  it("split: a split-ratio fact after the fiscal year end", () => {
    const facts = [
      ...base,
      fact({
        concept: "us-gaap:StockholdersEquityNoteStockSplitConversionRatio1",
        value: 3,
        start: "2026-04-01",
        end: "2026-06-30",
        filing: q2,
        unit: "pure",
      }),
    ];
    expect(computeEps(at(facts), ni(facts)).splitSinceLastAnnual).toBe(true);
  });

  it("a split-ratio fact inside the last fiscal year does not count", () => {
    const facts = [
      ...base,
      fact({
        concept: "us-gaap:StockholdersEquityNoteStockSplitConversionRatio1",
        value: 3,
        start: "2025-04-01",
        end: "2025-06-30",
        filing: k25,
        unit: "pure",
      }),
    ];
    expect(computeEps(at(facts), ni(facts)).splitSinceLastAnnual).toBe(false);
  });
});

describe("isSplitLike (§5, §14)", () => {
  it.each([
    [2, true],
    [0.5, true], // a 1-for-2 reverse split
    [1.5, true], // 3-for-2
    [2 / 3, true],
    [10, true],
    [0.1, true],
    [50, true],
    [2.03, true], // within 2% of 2
    [2.1, false], // 5% from 2
    [1.3, false], // a large restatement, not a split
    [2.5, false], // 5-for-2 is not on the list
    [1.04, false], // LII-like restatement noise
    [60, false],
  ])("ratio %s → %s", (r, expected) => {
    expect(isSplitLike(r)).toBe(expected);
  });
});
