import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFundamentals } from "@/domain/fundamentals";
import type { Metric } from "@/domain/types";
import { createLimiter, createSecClient } from "@/sec/client";
import { getCompanyFacts } from "@/sec/freshness";
import { fixtureFetch } from "../helpers/fixtures";

// LII Q2 2026 golden test (blueprint §16). Expected values come from the filings'
// rendered statements (see each "source" in the JSON), never from the engine. The
// pipeline runs offline on frozen fixtures, through the companyfacts gap: the Q2 10-Q
// is missing from companyfacts, so its values are parsed from the filing.

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
  readFileSync(path.join(import.meta.dirname, "LII-2026Q2.json"), "utf8"),
);

const fake = fixtureFetch(["LII/2026Q2"]);
const client = createSecClient({
  fetch: fake.fetch,
  env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
  logger: () => {},
  limiter: createLimiter(0),
});
const adapter = await getCompanyFacts(golden.cik, {
  asOf: golden.asOf,
  client,
});
const f = buildFundamentals(adapter);

function value(m: Metric): number {
  if (m.status !== "reported" && m.status !== "derived")
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m.value;
}

describe("LII Q2 2026 golden", () => {
  it("takes the filing-parse path for the 10-Q", () => {
    expect(f.freshness.status).toBe("filing-parsed");
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

  it("10-Q components came from the parsed filing, FY from companyfacts", () => {
    const calc = f.ltmDetail.revenue;
    expect(calc.fy.source).toBe("companyfacts");
    expect(calc.ytdCurrent?.source).toBe("filing");
    expect(calc.ytdPrior?.source).toBe("filing");
    expect(f.metrics.revenue.warnings.map((w) => w.code)).toContain(
      "W_FILING_PARSED",
    );
  });

  it("diluted EPS components and LTM, to the cent", () => {
    const g: GoldenMetric = golden.metrics.dilutedEps;
    const calc = f.ltmDetail.dilutedEps;
    expect(calc.concept).toBe(g.concept);
    for (const part of ["fy", "ytdCurrent", "ytdPrior"] as const)
      expect(calc[part]!.value).toBe(g.components[part].value);
    expect(Math.abs(value(f.metrics.dilutedEps) - g.ltm)).toBeLessThan(0.005);
  });

  it("EPS cross-check against net income ÷ FY diluted shares passes (no warning)", () => {
    expect(f.eps.crossCheck).toMatchObject({
      status: "checked",
      dilutedShares: golden.epsCrossCheck.fyDilutedShares,
    });
    expect(f.metrics.dilutedEps.warnings.map((w) => w.code)).not.toContain(
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

  it("D&A carries the cash-flow warning", () => {
    expect(f.metrics.da.warnings.map((w) => w.code)).toContain(
      "W_DA_FROM_CASH_FLOW",
    );
  });
});
