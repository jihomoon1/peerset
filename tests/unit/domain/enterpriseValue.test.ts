import { describe, expect, it } from "vitest";
import type { ShareClasses } from "@/domain/capitalization";
import {
  computeEnterpriseValue,
  computeMarketCap,
} from "@/domain/enterpriseValue";
import type { Metric, QuoteSnapshot } from "@/domain/types";
import { fact, filing } from "../../helpers/facts";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// Methodology §6 (market cap = Σ price × shares over classes), §9 (EV bridge and the
// not-in-EV warning) and §12 (stale price).

const q2 = filing("0000000001-26-000050", "10-Q", "2026-07-28", "2026-06-30");
const sharesFact = (value: number) =>
  fact({
    concept: "dei:EntityCommonStockSharesOutstanding",
    value,
    end: "2026-08-04",
    filing: q2,
    unit: "shares",
    source: "filing",
  });

function twoClasses(): ShareClasses {
  return {
    classes: [
      {
        classMember: "us-gaap:CommonClassBMember",
        ticker: "SYN-B",
        shares: 20,
        sharesAsOf: "2026-08-04",
        coverFiling: q2,
        fact: sharesFact(20),
      },
      {
        classMember: "us-gaap:CommonStockMember",
        ticker: "SYN",
        shares: 100,
        sharesAsOf: "2026-08-04",
        coverFiling: q2,
        fact: sharesFact(100),
      },
    ],
    coverClassCount: 2,
    warnings: [],
  };
}

const quote = (
  symbol: string,
  close: number,
  asOfDate = "2026-10-23",
): QuoteSnapshot => ({
  symbol,
  close,
  currency: "USD",
  asOfDate,
  source: "user_entered",
  retrievedAt: "2026-10-26T14:00:00.000Z",
});

const value = (m: Metric) =>
  m.status === "derived" || m.status === "reported" ? m.value : undefined;

describe("computeMarketCap", () => {
  it("sums price × shares over every class", () => {
    const r = computeMarketCap(
      twoClasses(),
      [quote("SYN", 10), quote("SYN-B", 12.5)],
      "2026-10-26",
    );
    expect(value(r.marketCap)).toBe(10 * 100 + 12.5 * 20);
    expect(r.classes.map((c) => value(c.equityValue))).toEqual([250, 1000]);
    expect(r.marketCap).toMatchObject({
      status: "derived",
      unit: "USD",
      period: { kind: "instant", end: "2026-10-23" },
    });
    expect(r.priceDate).toBe("2026-10-23");
  });

  it("matches quotes to classes whatever the spelling", () => {
    const r = computeMarketCap(
      twoClasses(),
      [quote("syn", 10), quote("SYN.B", 12.5)],
      "2026-10-26",
    );
    expect(value(r.marketCap)).toBe(1250);
  });

  it("a class without a price makes market cap Missing, naming the ticker", () => {
    const r = computeMarketCap(twoClasses(), [quote("SYN", 10)], "2026-10-26");
    expect(r.marketCap).toEqual({
      status: "missing",
      reason: "price needed for SYN-B",
      warnings: [],
    });
    expect(r.classes.find((c) => c.ticker === "SYN-B")?.equityValue).toEqual({
      status: "missing",
      reason: "price needed for SYN-B",
      warnings: [],
    });
    expect(value(r.classes.find((c) => c.ticker === "SYN")!.equityValue)).toBe(
      1000,
    );
  });

  it("no prices at all names every ticker", () => {
    const r = computeMarketCap(twoClasses(), [], "2026-10-26");
    expect(r.marketCap.status === "missing" && r.marketCap.reason).toBe(
      "price needed for SYN-B, SYN",
    );
  });

  it("a share-class blocker passes through, whatever the prices", () => {
    const sc: ShareClasses = {
      ...twoClasses(),
      blocker: {
        status: "unsupported",
        reason: {
          code: "UNLISTED_SHARE_CLASS",
          message: "unlisted share class: us-gaap:CommonClassBMember",
        },
      },
    };
    const r = computeMarketCap(sc, [quote("SYN", 10)], "2026-10-26");
    expect(r.marketCap).toEqual({
      status: "unsupported",
      reason: {
        code: "UNLISTED_SHARE_CLASS",
        message: "unlisted share class: us-gaap:CommonClassBMember",
      },
      warnings: [],
    });
  });

  it("an unlisted class's equity value is Unsupported", () => {
    const sc = twoClasses();
    delete sc.classes[0].ticker;
    sc.blocker = {
      status: "unsupported",
      reason: { code: "UNLISTED_SHARE_CLASS", message: "unlisted" },
    };
    const r = computeMarketCap(sc, [quote("SYN", 10)], "2026-10-26");
    expect(r.classes[0].equityValue.status).toBe("unsupported");
  });

  describe("W_PRICE_STALE (methodology 0.3.1 §12)", () => {
    it("is quiet at exactly 7 days", () => {
      const r = computeMarketCap(
        twoClasses(),
        [quote("SYN", 10, "2026-10-19"), quote("SYN-B", 12, "2026-10-19")],
        "2026-10-26",
      );
      expect(r.marketCap.warnings).toEqual([]);
    });

    it("warns at 8 days, per stale price", () => {
      const r = computeMarketCap(
        twoClasses(),
        [quote("SYN", 10, "2026-10-18"), quote("SYN-B", 12, "2026-10-23")],
        "2026-10-26",
      );
      expect(r.marketCap.warnings).toEqual([
        {
          code: "W_PRICE_STALE",
          message: "price for SYN is 8 days old (2026-10-18)",
          severity: "caution",
        },
      ]);
    });

    it("prices with different dates show the earliest as the price date", () => {
      const r = computeMarketCap(
        twoClasses(),
        [quote("SYN", 10, "2026-10-22"), quote("SYN-B", 12, "2026-10-23")],
        "2026-10-26",
      );
      expect(r.priceDate).toBe("2026-10-22");
    });
  });
});

describe("computeEnterpriseValue on the frozen fixtures", () => {
  it("LII: EV = market cap + total debt − cash, with all three dates", async () => {
    const f = await fixtureFundamentals("LII");
    const { marketCap, priceDate } = computeMarketCap(
      f.shareClasses,
      [quote("LII", 500)],
      "2026-10-26",
    );
    const b = computeEnterpriseValue({
      marketCap,
      debt: f.debt,
      cash: f.cash,
      preferred: f.evAdjustments.preferred,
      nci: f.evAdjustments.nci,
      balanceSheetDate: f.balanceSheet.date,
      priceDate,
      sharesAsOf: "2026-07-22",
    });
    // 500.00 × 34,560,675 + 1,581,300,000 − 52,100,000
    expect(value(b.marketCap)).toBe(17_280_337_500);
    expect(value(b.enterpriseValue)).toBe(18_809_537_500);
    expect(b.enterpriseValue.status).toBe("derived");
    expect(b.dates).toEqual({
      price: "2026-10-23",
      balanceSheet: "2026-06-30",
      sharesAsOf: "2026-07-22",
    });
    expect(b.debtLines.filter((l) => l.included).map((l) => l.value)).toEqual([
      412_000_000, 20_100_000, 1_149_200_000,
    ]);
    expect(b.notInEv).toEqual([
      { item: "preferred", status: "derived", value: 0 },
      { item: "nci", status: "missing" },
    ]);
    expect(b.enterpriseValue.warnings).toEqual([]);
  });

  describe("WSO: NCI 478,797,000 against the 5% threshold", () => {
    async function at(price: number) {
      const f = await fixtureFundamentals("WSO");
      const { marketCap, priceDate } = computeMarketCap(
        f.shareClasses,
        [quote("WSO", price), quote("WSO-B", price)],
        "2026-10-26",
      );
      return computeEnterpriseValue({
        marketCap,
        debt: f.debt,
        cash: f.cash,
        preferred: f.evAdjustments.preferred,
        nci: f.evAdjustments.nci,
        balanceSheetDate: f.balanceSheet.date,
        priceDate,
        sharesAsOf: "2026-08-04",
      });
    }

    it("450.00: market cap 18,563,487,300, NCI 2.58%, no warning", async () => {
      const b = await at(450);
      expect(value(b.marketCap)).toBe(18_563_487_300);
      // 18,563,487,300 + 9,068,000 − 464,189,000
      expect(value(b.enterpriseValue)).toBe(18_108_366_300);
      expect(b.enterpriseValue.warnings).toEqual([]);
      expect(b.notInEv).toContainEqual({
        item: "nci",
        status: "derived",
        value: 478_797_000,
      });
    });

    it("200.00: market cap 8,250,438,800, NCI 5.80%, warns", async () => {
      const b = await at(200);
      expect(value(b.marketCap)).toBe(8_250_438_800);
      expect(b.enterpriseValue.warnings).toEqual([
        {
          code: "W_NOT_IN_EV",
          message:
            "material item not in EV: noncontrolling interest 478.8M is 5.8% of market cap (above 5%)",
          severity: "caution",
        },
      ]);
    });
  });
});

describe("computeEnterpriseValue rules", () => {
  const usd = (v: number): Metric => ({
    status: "derived",
    value: v,
    unit: "USD",
    period: { kind: "instant", end: "2026-06-30" },
    formula: "test",
    inputs: [],
    warnings: [],
  });
  const item = (metric: Metric) => ({
    metric,
    lines: [],
    method: "face" as const,
  });
  const base = {
    marketCap: usd(1_000_000_000),
    debt: item(usd(100)),
    cash: item(usd(50)),
    preferred: item({ status: "missing", reason: "none", warnings: [] }),
    nci: item({ status: "missing", reason: "none", warnings: [] }),
    balanceSheetDate: "2026-06-30",
    priceDate: "2026-10-23",
    sharesAsOf: "2026-08-04",
  };

  it("NCI at exactly 5% of market cap does not warn (> 5% does)", () => {
    const exact = computeEnterpriseValue({
      ...base,
      nci: item(usd(50_000_000)),
    });
    expect(exact.enterpriseValue.warnings).toEqual([]);
    const above = computeEnterpriseValue({
      ...base,
      nci: item(usd(50_000_001)),
    });
    expect(above.enterpriseValue.warnings.map((w) => w.code)).toEqual([
      "W_NOT_IN_EV",
    ]);
  });

  it("preferred above zero warns", () => {
    const b = computeEnterpriseValue({ ...base, preferred: item(usd(1)) });
    expect(b.enterpriseValue.warnings).toEqual([
      {
        code: "W_NOT_IN_EV",
        message: "material item not in EV: preferred stock 0.0M",
        severity: "caution",
      },
    ]);
  });

  it("missing market cap makes EV Missing with the same reason", () => {
    const b = computeEnterpriseValue({
      ...base,
      marketCap: {
        status: "missing",
        reason: "price needed for LII",
        warnings: [],
      },
    });
    expect(b.enterpriseValue).toEqual({
      status: "missing",
      reason: "price needed for LII",
      warnings: [],
    });
  });

  it("missing cash makes EV Missing, never a zero", () => {
    const b = computeEnterpriseValue({
      ...base,
      cash: item({ status: "missing", reason: "no cash line", warnings: [] }),
    });
    expect(b.enterpriseValue).toMatchObject({
      status: "missing",
      reason: "EV needs cash and short-term investments, which is missing",
    });
  });

  it("unsupported debt makes EV Unsupported", () => {
    const b = computeEnterpriseValue({
      ...base,
      debt: item({
        status: "unsupported",
        reason: {
          code: "UNRECOGNIZED_DEBT_LINE",
          message: "unrecognized debt line: 'Revolver' (x:Y)",
        },
        warnings: [],
      }),
    });
    expect(b.enterpriseValue).toMatchObject({
      status: "unsupported",
      reason: {
        code: "INPUT_UNSUPPORTED",
        message:
          "EV needs total debt, which is unsupported: unrecognized debt line: 'Revolver' (x:Y)",
      },
    });
  });

  it("a negative EV is still a derived value (multiples withhold it)", () => {
    const b = computeEnterpriseValue({
      ...base,
      marketCap: usd(10),
      cash: item(usd(1_000)),
    });
    expect(value(b.enterpriseValue)).toBe(10 + 100 - 1_000);
  });
});

describe("market cap never starts from zero (methodology-reviewer, M2b)", () => {
  it("no classes and no blocker is Missing, not a derived 0", () => {
    const r = computeMarketCap(
      { classes: [], coverClassCount: 0, warnings: [] },
      [],
      "2026-10-26",
    );
    expect(r.marketCap).toEqual({
      status: "missing",
      reason: "no share classes to price",
      warnings: [],
    });
  });

  it("a stale price warns on EV as well as market cap", async () => {
    const f = await fixtureFundamentals("LII");
    const { marketCap, priceDate } = computeMarketCap(
      f.shareClasses,
      [quote("LII", 500, "2026-10-01")],
      "2026-10-26",
    );
    const b = computeEnterpriseValue({
      marketCap,
      debt: f.debt,
      cash: f.cash,
      preferred: f.evAdjustments.preferred,
      nci: f.evAdjustments.nci,
      balanceSheetDate: f.balanceSheet.date,
      priceDate,
    });
    expect(b.enterpriseValue.warnings.map((w) => w.code)).toEqual([
      "W_PRICE_STALE",
    ]);
  });
});
