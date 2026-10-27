import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Metric, QuoteSnapshot } from "@/domain/types";
import { priceCompany } from "@/domain/valuation";
import { FIXTURES, fixtureFundamentals } from "../helpers/fundamentals";

// Valuation goldens at documented test prices (M2b). Each JSON writes its arithmetic
// out from the confirmed reconciliation inputs; the engine must match to the dollar
// (market cap, EV) and to 0.01x (multiples).

interface Golden {
  ticker: string;
  fixture: keyof typeof FIXTURES;
  methodologyVersion: string;
  analysisDate: string;
  prices: { symbol: string; close: number; asOfDate: string }[];
  shareClasses: {
    classMember: string;
    ticker: string;
    shares: number;
    sharesAsOf: string;
  }[];
  marketCap: { value: number };
  totalDebt: number;
  cash: number;
  enterpriseValue: { value: number };
  dates: { price: string; balanceSheet: string; sharesAsOf: string };
  notInEvWarning: boolean;
  multiples: Record<
    "evRevenue" | "evEbitda" | "pe",
    | { status: "derived"; value: number }
    | { status: "unsupported"; code: string }
  >;
}

const goldens: Golden[] = readdirSync(import.meta.dirname)
  .filter((f) => f.endsWith("-valuation.json"))
  .sort()
  .map((f) =>
    JSON.parse(readFileSync(path.join(import.meta.dirname, f), "utf8")),
  );

function value(m: Metric): number {
  if (m.status !== "reported" && m.status !== "derived")
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m.value;
}

it("covers LII and WSO", () => {
  expect(goldens.map((g) => g.ticker)).toEqual(["LII", "WSO"]);
});

describe.each(goldens)("$ticker valuation at test prices", (g) => {
  const quotes: QuoteSnapshot[] = g.prices.map((p) => ({
    ...p,
    currency: "USD",
    source: "user_entered",
    retrievedAt: `${g.analysisDate}T00:00:00.000Z`,
  }));

  it("golden arithmetic adds up", () => {
    expect(
      g.shareClasses.reduce(
        (sum, c) =>
          sum + c.shares * g.prices.find((p) => p.symbol === c.ticker)!.close,
        0,
      ),
    ).toBe(g.marketCap.value);
    expect(g.marketCap.value + g.totalDebt - g.cash).toBe(
      g.enterpriseValue.value,
    );
  });

  it("matches share classes, market cap, EV and dates to the dollar", async () => {
    const f = await fixtureFundamentals(g.fixture);
    expect(f.methodologyVersion).toBe(g.methodologyVersion);
    const v = priceCompany(f, quotes, g.analysisDate);
    expect(
      v.shareClasses.map((c) => ({
        classMember: c.classMember,
        ticker: c.ticker,
        shares: c.shares,
        sharesAsOf: c.sharesAsOf,
      })),
    ).toEqual(
      g.shareClasses.map(({ classMember, ticker, shares, sharesAsOf }) => ({
        classMember,
        ticker,
        shares,
        sharesAsOf,
      })),
    );
    expect(value(v.bridge.marketCap)).toBe(g.marketCap.value);
    expect(value(v.bridge.totalDebt)).toBe(g.totalDebt);
    expect(value(v.bridge.cashAndInvestments)).toBe(g.cash);
    expect(value(v.bridge.enterpriseValue)).toBe(g.enterpriseValue.value);
    expect(v.bridge.dates).toEqual(g.dates);
    expect(
      v.bridge.enterpriseValue.warnings.some((w) => w.code === "W_NOT_IN_EV"),
    ).toBe(g.notInEvWarning);
  });

  it.each(["evRevenue", "evEbitda", "pe"] as const)(
    "%s matches to 0.01x",
    async (key) => {
      const f = await fixtureFundamentals(g.fixture);
      const m = priceCompany(f, quotes, g.analysisDate).multiples[key];
      const want = g.multiples[key];
      if (want.status === "unsupported") {
        expect(m).toMatchObject({
          status: "unsupported",
          reason: { code: want.code },
        });
      } else {
        expect(m.status).toBe("derived");
        expect(Math.abs(value(m) - want.value)).toBeLessThan(0.005);
      }
    },
  );
});
