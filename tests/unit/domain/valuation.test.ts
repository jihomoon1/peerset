import { describe, expect, it } from "vitest";
import type { QuoteSnapshot } from "@/domain/types";
import { priceCompany } from "@/domain/valuation";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// Blueprint §13: one pure function prices a company, on the server and in the
// browser alike.

const quote = (symbol: string, close: number): QuoteSnapshot => ({
  symbol,
  close,
  currency: "USD",
  asOfDate: "2026-10-23",
  source: "user_entered",
  retrievedAt: "2026-10-26T14:00:00.000Z",
});

describe("priceCompany", () => {
  it("before any price: market cap, EV and every multiple say a price is needed", async () => {
    const f = await fixtureFundamentals("LII");
    const v = priceCompany(f, [], "2026-10-26");
    expect(v.needsPrice).toEqual(["LII"]);
    for (const m of [
      v.bridge.marketCap,
      v.bridge.enterpriseValue,
      v.multiples.evRevenue,
      v.multiples.evEbitda,
      v.multiples.pe,
    ])
      expect(m.status).toBe("missing");
  });

  it("LII at 500.00 prices all three multiples", async () => {
    const f = await fixtureFundamentals("LII");
    const v = priceCompany(f, [quote("LII", 500)], "2026-10-26");
    expect(v.needsPrice).toEqual([]);
    expect(v.multiples.pe).toMatchObject({ status: "derived" });
    expect(v.bridge.dates).toEqual({
      price: "2026-10-23",
      balanceSheet: "2026-06-30",
      sharesAsOf: "2026-07-22",
    });
    expect(v.price).toMatchObject({
      status: "reported",
      value: 500,
      unit: "USD/shares",
    });
  });

  it("WSO: P/E Unsupported (multi-class) even before prices", async () => {
    const f = await fixtureFundamentals("WSO");
    const v = priceCompany(f, [quote("WSO", 450)], "2026-10-26");
    expect(v.needsPrice).toEqual(["WSO-B"]);
    expect(v.multiples.pe).toMatchObject({
      status: "unsupported",
      reason: { code: "MULTI_CLASS" },
    });
    expect(v.price).toBeUndefined();
  });

  it("the result is plain JSON", async () => {
    const f = await fixtureFundamentals("WSO");
    const v = priceCompany(
      f,
      [quote("WSO", 450), quote("WSO-B", 450)],
      "2026-10-26",
    );
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});

describe("priceCompany without usable share classes", () => {
  it("no cover count: P/E is Missing like market cap, not MULTI_CLASS", async () => {
    const f = await fixtureFundamentals("LII");
    const g = {
      ...f,
      shareClasses: {
        classes: [],
        coverClassCount: 0,
        blocker: {
          status: "missing" as const,
          reason: "no cover-page share count in the latest filing",
        },
        warnings: [],
      },
    };
    const v = priceCompany(g, [quote("LII", 500)], "2026-10-26");
    expect(v.multiples.pe).toMatchObject({
      status: "missing",
      reason: "P/E needs price, which is missing",
    });
  });
});

describe("P/E follows the cover's classes, not the usable ones", () => {
  it("a share-class blocker makes P/E Unsupported even with one priced class", async () => {
    const f = await fixtureFundamentals("LII");
    const g = {
      ...f,
      shareClasses: {
        ...f.shareClasses,
        coverClassCount: 2,
        blocker: {
          status: "unsupported" as const,
          reason: {
            code: "SHARE_CLASS_MISMATCH" as const,
            message: "one cover share count for several listed classes",
          },
        },
      },
    };
    const v = priceCompany(g, [quote("LII", 500)], "2026-10-26");
    expect(v.multiples.pe).toMatchObject({
      status: "unsupported",
      reason: { code: "MULTI_CLASS" },
    });
  });

  it("a stale price warns on P/E", async () => {
    const f = await fixtureFundamentals("LII");
    const v = priceCompany(
      f,
      [{ ...quote("LII", 500), asOfDate: "2026-10-01" }],
      "2026-10-26",
    );
    expect(v.multiples.pe.warnings.map((w) => w.code)).toContain(
      "W_PRICE_STALE",
    );
    expect(v.multiples.evEbitda.warnings.map((w) => w.code)).toContain(
      "W_PRICE_STALE",
    );
  });
});

describe("review follow-ups (after M2b)", () => {
  it("a stale price warns on P/E even when a share-class blocker stops market cap", async () => {
    const f = await fixtureFundamentals("LII");
    const g = {
      ...f,
      shareClasses: {
        ...f.shareClasses,
        blocker: {
          status: "unsupported" as const,
          reason: {
            code: "SHARE_CLASS_MISMATCH" as const,
            message: "cover share counts have different dates",
          },
        },
      },
    };
    const v = priceCompany(
      g,
      [{ ...quote("LII", 500), asOfDate: "2026-10-01" }],
      "2026-10-26",
    );
    expect(v.price?.warnings.map((w) => w.code)).toEqual(["W_PRICE_STALE"]);
    expect(v.multiples.pe.warnings.map((w) => w.code)).toContain(
      "W_PRICE_STALE",
    );
  });

  it("share-class warnings reach market cap (methodology §6)", async () => {
    const f = await fixtureFundamentals("LII");
    const v = priceCompany(f, [quote("LII", 500)], "2026-10-26");
    expect(v.bridge.marketCap.warnings.map((w) => w.code)).toContain(
      "W_SHARES_AFTER_BALANCE_SHEET",
    );
    const before = priceCompany(f, [], "2026-10-26");
    expect(before.bridge.marketCap.warnings.map((w) => w.code)).toContain(
      "W_SHARES_AFTER_BALANCE_SHEET",
    );
  });
});
