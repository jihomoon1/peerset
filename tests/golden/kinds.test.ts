import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Metric, QuoteSnapshot } from "@/domain/types";
import { priceCompany } from "@/domain/valuation";
import { FIXTURES, fixtureFundamentals } from "../helpers/fundamentals";

// Issuer-kind goldens (methodology 0.5.0 §13B–§13D). Expected values come from each
// filing's rendered balance sheet and SEC's companyfacts (see "note" in each JSON),
// never from the engine. The full adapter → domain path runs offline on fixtures.

type Line = {
  label: string;
  concept: string;
  displayed: string;
  value?: number;
  included?: boolean;
};
interface Golden {
  ticker: keyof typeof FIXTURES;
  kind: string;
  methodologyVersion: string;
  filing: { accession: string; reportDate: string };
  statement: { url: string };
  ebitda?: { status: string; code: string };
  commonEquity?: { value: number; lines: Line[] };
  tangibleCommonEquity?: {
    value: number;
    deducted: Line[];
    notDeducted: Line[];
  };
  netIncomeToCommon?: { value: number };
  rotce?: { value: number };
  digitalAssets?: { value: number; lines: Line[]; warnings: string[] };
  cryptoRemeasurement?: { value: number };
  ebitdaWarnings?: string[];
  shareClasses?: {
    classes: { classMember: string; shares: number; pricedAs: string }[];
    testPrice: number;
    marketCap: number;
  };
}

const goldens: Golden[] = readdirSync(import.meta.dirname)
  .filter((f) => f.endsWith("-kind.json"))
  .sort()
  .map((f) =>
    JSON.parse(readFileSync(path.join(import.meta.dirname, f), "utf8")),
  );

const value = (m: Metric | undefined) => {
  if (!m || (m.status !== "reported" && m.status !== "derived"))
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m.value;
};
const codes = (m: Metric) => m.warnings.map((w) => w.code);

describe.each(goldens)("$ticker issuer-kind golden", (g) => {
  it("reads the expected filing under the current methodology and classifies it", async () => {
    const f = await fixtureFundamentals(g.ticker);
    expect(f.methodologyVersion).toBe(g.methodologyVersion);
    expect(f.kind).toBe(g.kind);
    expect(f.balanceSheet.statement?.url).toBe(g.statement.url);
    expect(f.ltmEnd).toBe(g.filing.reportDate);
  });

  if (g.commonEquity) {
    const ce = g.commonEquity;
    const tce = g.tangibleCommonEquity!;
    it("common equity, TCE and ROTCE match the filing to the dollar", async () => {
      const f = await fixtureFundamentals(g.ticker);
      const bank = f.bank!;
      expect(f.metrics.ebitda.status).toBe(g.ebitda!.status);
      expect(value(bank.commonEquity.metric)).toBe(ce.value);
      expect(
        bank.commonEquity.lines
          .filter((l) => l.included)
          .map((l) => [l.concept, l.value]),
      ).toEqual(ce.lines.map((l) => [l.concept, l.value]));
      expect(value(bank.tangibleCommonEquity.metric)).toBe(tce.value);
      expect(
        bank.tangibleCommonEquity.lines
          .filter((l) => l.included)
          .map((l) => [l.concept, l.value]),
      ).toEqual(tce.deducted.map((l) => [l.concept, l.value]));
      const concepts = bank.tangibleCommonEquity.lines.map((l) => l.concept);
      for (const l of tce.notDeducted)
        expect(concepts).not.toContain(l.concept);
      expect(value(bank.netIncomeToCommon)).toBe(g.netIncomeToCommon!.value);
      expect(value(bank.rotce)).toBeCloseTo(g.rotce!.value, 12);
    });
  }

  if (g.digitalAssets) {
    const da = g.digitalAssets;
    it("digital assets count only the us-gaap crypto lines, to the dollar", async () => {
      const f = await fixtureFundamentals(g.ticker);
      const digital = f.digital!;
      expect(value(digital.digitalAssets.metric)).toBe(da.value);
      expect(
        digital.digitalAssets.lines.map((l) => [
          l.concept,
          l.value,
          l.included,
        ]),
      ).toEqual(da.lines.map((l) => [l.concept, l.value, l.included]));
      expect(codes(digital.digitalAssets.metric)).toEqual(da.warnings);
      expect(value(digital.cryptoRemeasurement)).toBe(
        g.cryptoRemeasurement!.value,
      );
      for (const w of g.ebitdaWarnings!)
        expect(codes(f.metrics.ebitda)).toContain(w);
    });
  }

  if (g.shareClasses) {
    const sc = g.shareClasses;
    it("prices every unlisted class at the listed ticker (§6, 0.5.1)", async () => {
      const f = await fixtureFundamentals(g.ticker);
      expect(
        f.shareClasses.classes.map((c) => [
          c.classMember,
          c.shares,
          c.pricedAs,
        ]),
      ).toEqual(sc.classes.map((c) => [c.classMember, c.shares, c.pricedAs]));
      const quote: QuoteSnapshot = {
        symbol: sc.classes[0].pricedAs,
        close: sc.testPrice,
        asOfDate: "2026-11-10",
        currency: "USD",
        source: "user_entered",
        retrievedAt: "2026-11-10T00:00:00.000Z",
      };
      const v = priceCompany(f, [quote], "2026-11-10");
      expect(value(v.bridge.marketCap)).toBe(sc.marketCap);
      expect(codes(v.bridge.marketCap)).toContain(
        "W_UNLISTED_CLASS_PRICED_AS_LISTED",
      );
      expect(v.needsPrice).toEqual([]);
      expect(v.multiples.mcapToDigitalAssets?.status).toBe("derived");
    });
  }
});
