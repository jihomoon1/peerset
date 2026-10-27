import { describe, expect, it } from "vitest";
import { computeMultiples, type MultiplesInput } from "@/domain/multiples";
import { nmReason } from "@/domain/nm";
import type { Metric } from "@/domain/types";

// Methodology §10: EV/Revenue = EV ÷ revenue, EV/EBITDA = EV ÷ EBITDA, P/E = price ÷
// EPS, with the NM policy table, plus §5's P/E restrictions.

const usd = (value: number, unit: "USD" | "USD/shares" = "USD"): Metric => ({
  status: "derived",
  value,
  unit,
  period: { kind: "duration", start: "2025-07-01", end: "2026-06-30" },
  formula: "test",
  inputs: [],
  warnings: [],
});
const perShare = (value: number): Metric => usd(value, "USD/shares");
const missing = (reason: string): Metric => ({
  status: "missing",
  reason,
  warnings: [],
});
const unsupported: Metric = {
  status: "unsupported",
  reason: { code: "LTM_CHECK_FAILED", message: "cannot reconstruct LTM" },
  warnings: [],
};

function input(over: Partial<MultiplesInput> = {}): MultiplesInput {
  return {
    ev: usd(18_809_537_500),
    revenue: usd(5_302_200_000),
    ebitda: usd(1_164_900_000),
    price: perShare(500),
    eps: perShare(22.51),
    singleClass: true,
    splitSinceLastAnnual: false,
    ...over,
  };
}

const value = (m: Metric) =>
  m.status === "derived" || m.status === "reported" ? m.value : undefined;

describe("nmReason (methodology §10)", () => {
  it.each([
    // [numerator, denominator, ev numerator?, denominator rule, expected]
    [10, 5, true, "REVENUE_NOT_POSITIVE", null],
    [10, 0, true, "REVENUE_NOT_POSITIVE", "REVENUE_NOT_POSITIVE"],
    [10, -5, true, "EBITDA_NOT_POSITIVE", "EBITDA_NOT_POSITIVE"],
    [0, 5, true, "REVENUE_NOT_POSITIVE", "EV_NOT_POSITIVE"],
    [-10, 5, true, "REVENUE_NOT_POSITIVE", "EV_NOT_POSITIVE"],
    [-10, -5, true, "EBITDA_NOT_POSITIVE", "EV_NOT_POSITIVE"], // EV first
    [500, 0, false, "EPS_NOT_POSITIVE", "EPS_NOT_POSITIVE"],
    [500, 5, false, "EPS_NOT_POSITIVE", null], // 100.0x exactly: not NM
    [500.05, 5, false, "EPS_NOT_POSITIVE", "ABOVE_CAP"], // 100.01x
    [1_000, 1, true, "REVENUE_NOT_POSITIVE", "ABOVE_CAP"],
  ] as const)(
    "%s ÷ %s (EV numerator %s) → %s",
    (num, den, ev, rule, expected) => {
      expect(nmReason(num, den, { evNumerator: ev, notPositive: rule })).toBe(
        expected,
      );
    },
  );
});

describe("computeMultiples", () => {
  it("computes the three multiples for a priced single-class company", () => {
    const m = computeMultiples(input());
    expect(value(m.evRevenue)).toBeCloseTo(3.5475, 4);
    expect(value(m.evEbitda)).toBeCloseTo(16.1469, 4);
    expect(value(m.pe)).toBeCloseTo(22.2124, 4);
    expect(m.evRevenue).toMatchObject({
      status: "derived",
      unit: "multiple",
      formula: "EV ÷ revenue (LTM)",
    });
    expect(m.pe).toMatchObject({ formula: "price ÷ diluted EPS (LTM)" });
  });

  describe("NM matrix", () => {
    it("revenue ≤ 0: EV/Revenue is NM", () => {
      for (const r of [0, -1])
        expect(
          computeMultiples(input({ revenue: usd(r) })).evRevenue,
        ).toMatchObject({ status: "nm", reason: "REVENUE_NOT_POSITIVE" });
    });

    it("EBITDA ≤ 0: EV/EBITDA is NM, EV/Revenue unaffected", () => {
      const m = computeMultiples(input({ ebitda: usd(-50_000_000) }));
      expect(m.evEbitda).toMatchObject({
        status: "nm",
        reason: "EBITDA_NOT_POSITIVE",
      });
      expect(m.evRevenue.status).toBe("derived");
    });

    it("EPS ≤ 0: P/E is NM", () => {
      for (const e of [0, -2.5])
        expect(computeMultiples(input({ eps: perShare(e) })).pe).toMatchObject({
          status: "nm",
          reason: "EPS_NOT_POSITIVE",
        });
    });

    it("EV ≤ 0: both EV multiples withheld, P/E unaffected", () => {
      for (const ev of [0, -1_000]) {
        const m = computeMultiples(input({ ev: usd(ev) }));
        expect(m.evRevenue).toMatchObject({
          status: "nm",
          reason: "EV_NOT_POSITIVE",
        });
        expect(m.evEbitda).toMatchObject({
          status: "nm",
          reason: "EV_NOT_POSITIVE",
        });
        expect(m.pe.status).toBe("derived");
      }
    });

    it("above 100.0x is NM; exactly 100.0x is not", () => {
      expect(
        computeMultiples(input({ price: perShare(2_251) })).pe.status,
      ).toBe("derived"); // 2,251 ÷ 22.51 = 100.0x
      expect(
        computeMultiples(input({ price: perShare(2_251.5) })).pe,
      ).toMatchObject({ status: "nm", reason: "ABOVE_CAP" });
      expect(
        computeMultiples(input({ ebitda: usd(100_000_000) })).evEbitda,
      ).toMatchObject({ status: "nm", reason: "ABOVE_CAP" }); // 188.1x
    });

    it("NM keeps the computed ratio for the tooltip", () => {
      const m = computeMultiples(input({ ebitda: usd(100_000_000) }));
      expect(m.evEbitda.status === "nm" && m.evEbitda.value).toBeCloseTo(
        188.095,
        3,
      );
    });

    it("a missing input is '—' (Missing), never NM", () => {
      const m = computeMultiples(
        input({
          ev: missing("price needed for LII"),
          price: missing("price needed for LII"),
        }),
      );
      expect(m.evRevenue).toMatchObject({ status: "missing" });
      expect(m.evEbitda).toMatchObject({ status: "missing" });
      expect(m.pe).toMatchObject({ status: "missing" });
      expect(m.pe.status === "missing" && m.pe.reason).toBe(
        "P/E needs price, which is missing",
      );
    });

    it("an Unsupported input passes through as Unsupported", () => {
      const m = computeMultiples(input({ ebitda: unsupported }));
      expect(m.evEbitda).toMatchObject({
        status: "unsupported",
        reason: { code: "INPUT_UNSUPPORTED" },
      });
      expect(
        m.evEbitda.status === "unsupported" && m.evEbitda.reason.message,
      ).toBe(
        "EV/EBITDA needs EBITDA, which is unsupported: cannot reconstruct LTM",
      );
      expect(m.evRevenue.status).toBe("derived");
    });
  });

  describe("P/E restrictions (methodology §5)", () => {
    it("is Unsupported for a multi-class company, before any price is needed", () => {
      const m = computeMultiples(
        input({ singleClass: false, price: missing("price needed for WSO") }),
      );
      expect(m.pe).toEqual({
        status: "unsupported",
        reason: {
          code: "MULTI_CLASS",
          message: "P/E is computed for single-class companies only",
        },
        warnings: [],
      });
    });

    it("is Unsupported after a split since the last 10-K", () => {
      expect(
        computeMultiples(input({ splitSinceLastAnnual: true })).pe,
      ).toEqual({
        status: "unsupported",
        reason: {
          code: "SPLIT_SINCE_ANNUAL",
          message: "split since last 10-K",
        },
        warnings: [],
      });
    });

    it("leaves the EV multiples alone in both cases", () => {
      const m = computeMultiples(
        input({ singleClass: false, splitSinceLastAnnual: true }),
      );
      expect(m.evRevenue.status).toBe("derived");
      expect(m.evEbitda.status).toBe("derived");
    });
  });
});
