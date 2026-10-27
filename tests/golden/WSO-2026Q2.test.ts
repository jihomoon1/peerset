import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Metric } from "@/domain/types";
import { fixtureFundamentals } from "../helpers/fundamentals";

// WSO Q2 2026 LTM golden (blueprint §16), added in M2b so WSO's EV multiples rest on
// transcribed filing values. Expected values come from the filings' XBRL facts read
// straight from the fixture files (see each "source"), never from the engine.

interface Component {
  value: number;
  period: { start: string; end: string };
  source: { accession: string };
}
interface GoldenMetric {
  concept: string;
  components: Record<"fy" | "ytdCurrent" | "ytdPrior", Component>;
  ltm: number;
}
const golden = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "WSO-2026Q2.json"), "utf8"),
);
const f = await fixtureFundamentals("WSO");

function value(m: Metric): number {
  if (m.status !== "reported" && m.status !== "derived")
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m.value;
}

describe("WSO Q2 2026 golden", () => {
  it("is the June 30, 2026 10-Q", () => {
    expect(f.freshness.latestAccession).toBe(golden.latestFiling.accession);
    expect(f.ltmEnd).toBe(golden.latestFiling.reportDate);
    expect(f.methodologyVersion).toBe(golden.methodologyVersion);
  });

  describe.each(["revenue", "operatingIncome", "da", "netIncome"] as const)(
    "%s",
    (key) => {
      const g: GoldenMetric = golden.metrics[key];

      it("uses the expected concept and components, to the dollar", () => {
        const calc = f.ltmDetail[key];
        expect(calc.concept).toBe(g.concept);
        expect(calc.method).toBe("fy_plus_ytd_minus_prior_ytd");
        for (const part of ["fy", "ytdCurrent", "ytdPrior"] as const) {
          const fact = calc[part]!;
          const want = g.components[part];
          expect(fact.value, `${key} ${part}`).toBe(want.value);
          expect(fact.period).toMatchObject(want.period);
          expect(fact.filing.accession).toBe(want.source.accession);
        }
        expect(calc.checks.every((c) => c.passed)).toBe(true);
      });

      it("has the expected LTM value, to the dollar", () => {
        expect(value(f.metrics[key])).toBe(g.ltm);
        expect(f.metrics[key]).toMatchObject({
          period: { start: golden.ltmPeriod.start, end: golden.ltmPeriod.end },
        });
      });
    },
  );

  it("diluted EPS components and LTM, to the cent", () => {
    const g: GoldenMetric = golden.metrics.dilutedEps;
    const calc = f.ltmDetail.dilutedEps;
    expect(calc.concept).toBe(g.concept);
    for (const part of ["fy", "ytdCurrent", "ytdPrior"] as const)
      expect(calc[part]!.value).toBe(g.components[part].value);
    expect(Math.abs(value(f.metrics.dilutedEps) - g.ltm)).toBeLessThan(0.005);
  });

  it("EPS cross-check gap is above 5%, so it warns (not a suppression)", () => {
    expect(f.eps.crossCheck).toMatchObject({
      status: "checked",
      dilutedShares: golden.epsCrossCheck.fyDilutedShares,
    });
    expect(f.metrics.dilutedEps.warnings.map((w) => w.code)).toContain(
      "W_EPS_CROSSCHECK",
    );
    expect(f.eps.splitSinceLastAnnual).toBe(false);
  });

  it("EBITDA and margin, to the dollar", () => {
    expect(value(f.metrics.ebitda)).toBe(golden.metrics.ebitda.ltm);
    expect(value(f.metrics.ebitdaMargin)).toBe(
      golden.metrics.ebitdaMargin.ltmNumerator /
        golden.metrics.ebitdaMargin.ltmDenominator,
    );
  });
});
