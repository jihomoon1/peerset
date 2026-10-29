import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFundamentals } from "@/domain/fundamentals";
import type { Metric } from "@/domain/types";
import { createLimiter, createSecClient } from "@/sec/client";
import { getCompanyFacts } from "@/sec/freshness";
import { fixtureFetch } from "../helpers/fixtures";

// GGG Q3 2026 and JCI fiscal Q3 2026 LTM goldens (M4b). Same pattern as
// LII-2026Q2.test.ts: expected values come from the rendered filings (each "source"
// in the JSON), never from the engine. GGG has a 52/53-week year ending the last
// Friday of December; JCI has a September year-end and no OperatingIncomeLoss tag,
// so its operating income, EBITDA and margin are Unsupported (methodology §3).

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

function value(m: Metric): number {
  if (m.status !== "reported" && m.status !== "derived")
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m.value;
}

describe.each(["GGG-2026Q3", "JCI-2026Q2"])("%s golden", async (name) => {
  const golden = JSON.parse(
    readFileSync(path.join(import.meta.dirname, `${name}.json`), "utf8"),
  );
  const fake = fixtureFetch([golden.fixture]);
  const client = createSecClient({
    fetch: fake.fetch,
    env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
    logger: () => {},
    limiter: createLimiter(0),
  });
  const f = buildFundamentals(
    await getCompanyFacts(golden.cik, { asOf: golden.asOf, client }),
  );
  const keys = Object.keys(golden.metrics).filter(
    (k) => k !== "dilutedEps",
  ) as ("revenue" | "operatingIncome" | "da" | "netIncome")[];

  it("uses the expected latest filing and freshness path", () => {
    expect(f.freshness.status).toBe(golden.freshness);
    expect(f.freshness.latestAccession).toBe(golden.latestFiling.accession);
    expect(f.ltmEnd).toBe(golden.latestFiling.reportDate);
    expect(f.methodologyVersion).toBe(golden.methodologyVersion);
  });

  it.each(keys)("%s: concept and components, to the dollar", (key) => {
    const g: GoldenMetric = golden.metrics[key];
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

  it.each(keys)("%s: LTM value, to the dollar", (key) => {
    expect(value(f.metrics[key])).toBe(golden.metrics[key].ltm);
    expect(f.metrics[key]).toMatchObject({
      period: { start: golden.ltmPeriod.start, end: golden.ltmPeriod.end },
    });
  });

  it("diluted EPS components and LTM, to the cent", () => {
    const g: GoldenMetric = golden.metrics.dilutedEps;
    const calc = f.ltmDetail.dilutedEps;
    expect(calc.concept).toBe(g.concept);
    for (const part of ["fy", "ytdCurrent", "ytdPrior"] as const)
      expect(calc[part]!.value).toBe(g.components[part].value);
    expect(Math.abs(value(f.metrics.dilutedEps) - g.ltm)).toBeLessThan(0.005);
  });

  it("EPS cross-check passes (no warning)", () => {
    expect(f.eps.crossCheck).toMatchObject({
      status: "checked",
      dilutedShares: golden.epsCrossCheck.fyDilutedShares,
    });
    expect(f.metrics.dilutedEps.warnings.map((w) => w.code)).not.toContain(
      "W_EPS_CROSSCHECK",
    );
    expect(f.eps.splitSinceLastAnnual).toBe(false);
  });

  if (golden.ebitda)
    it("EBITDA and margin, to the dollar", () => {
      expect(value(f.metrics.ebitda)).toBe(golden.ebitda.ltm);
      expect(value(f.metrics.ebitdaMargin)).toBe(
        golden.ebitdaMargin.ltmNumerator / golden.ebitdaMargin.ltmDenominator,
      );
    });

  it.each(Object.entries(golden.unsupported as Record<string, string>))(
    "%s is Unsupported (%s)",
    (key, code) => {
      expect(f.metrics[key as "ebitda"]).toMatchObject({
        status: "unsupported",
        reason: { code },
      });
    },
  );
});
