import { describe, expect, it } from "vitest";
import {
  bridgeKeysFor,
  displayMetric,
  formatFactValue,
  formatFiscalYearEnd,
  factUnitLabel,
  METRIC_LABELS,
} from "@/ui/metricDisplay";
import type { Metric } from "@/domain/types";

const value = (v: number, unit: "USD" | "USD/shares" | "ratio"): Metric => ({
  status: "derived",
  value: v,
  unit,
  period: { kind: "duration", start: "2025-07-01", end: "2026-06-30" },
  formula: "f",
  inputs: [],
  warnings: [],
});

describe("displayMetric (blueprint §6 cell states)", () => {
  it("USD in millions to one decimal", () => {
    expect(displayMetric(value(5_302_200_000, "USD"))).toEqual({
      text: "5,302.2",
      kind: "value",
    });
  });

  it("EPS in dollars to two decimals, margin as a percentage", () => {
    expect(displayMetric(value(22.509999, "USD/shares")).text).toBe("22.51");
    expect(displayMetric(value(-0.12, "ratio")).text).toBe("(12.0%)");
  });

  it("Missing shows an em dash, never zero", () => {
    expect(
      displayMetric({ status: "missing", reason: "no fact", warnings: [] }),
    ).toEqual({ text: "—", kind: "missing", note: "no fact" });
  });

  it("Unsupported says so, with its reason", () => {
    expect(
      displayMetric({
        status: "unsupported",
        reason: { code: "LTM_CHECK_FAILED", message: "cannot reconstruct LTM" },
        warnings: [],
      }),
    ).toEqual({
      text: "Unsupported",
      kind: "unsupported",
      note: "cannot reconstruct LTM",
    });
  });
});

describe("formatFactValue", () => {
  it("formats by unit", () => {
    expect(formatFactValue(2_680_400_000, "USD")).toBe("2,680.4");
    expect(formatFactValue(11.06, "USD/shares")).toBe("11.06");
    expect(formatFactValue(35_400_000, "shares")).toBe("35.4");
    expect(formatFactValue(2, "pure")).toBe("2");
  });
});

describe("bridgeKeysFor", () => {
  it("lists the LTM bridges each metric rests on", () => {
    expect(bridgeKeysFor("revenue")).toEqual(["revenue"]);
    expect(bridgeKeysFor("ebitda")).toEqual(["operatingIncome", "da"]);
    expect(bridgeKeysFor("ebitdaMargin")).toEqual([
      "operatingIncome",
      "da",
      "revenue",
    ]);
  });
});

describe("labels and fiscal year end", () => {
  it("labels EBITDA as standardized and unadjusted (methodology §4)", () => {
    expect(METRIC_LABELS.ebitda).toBe("EBITDA (standardized, unadjusted)");
  });

  it("writes SEC's MMDD fiscal year end as a month and day", () => {
    expect(formatFiscalYearEnd("1231")).toBe("December 31");
    expect(formatFiscalYearEnd("0927")).toBe("September 27");
    expect(formatFiscalYearEnd("")).toBe("—");
  });
});

describe("factUnitLabel", () => {
  it("names the unit the formatted value is in", () => {
    expect(factUnitLabel("USD")).toBe("USD m");
    expect(factUnitLabel("shares")).toBe("m shares");
    expect(factUnitLabel("USD/shares")).toBe("USD per share");
    expect(factUnitLabel("pure")).toBe("ratio");
  });
});
