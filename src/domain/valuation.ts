// Prices one company: fundamentals + quotes → share-class capitalization, the EV
// bridge and the three multiples. Pure and isomorphic (blueprint §13): the server and
// the browser call this same function, so entering a price recomputes instantly and
// the export (M5) recomputes the same numbers. M4's comps.ts calls it per company.

import {
  computeEnterpriseValue,
  computeMarketCap,
  type EnterpriseValueBridge,
  type ShareClassCapitalization,
} from "./enterpriseValue";
import type { CompanyFundamentals } from "./fundamentals";
import { computeMultiples, type Multiples } from "./multiples";
import { isUsable } from "./metrics/common";
import type { Metric, QuoteSnapshot } from "./types";

export interface Valuation {
  shareClasses: ShareClassCapitalization[];
  needsPrice: string[]; // listed tickers still without a price ("Needs price")
  price?: Metric; // the single class's price, for P/E
  bridge: EnterpriseValueBridge;
  multiples: Multiples;
}

export function priceCompany(
  f: CompanyFundamentals,
  quotes: readonly QuoteSnapshot[],
  analysisDate: string,
): Valuation {
  const { classes, marketCap, priceDate } = computeMarketCap(
    f.shareClasses,
    quotes,
    analysisDate,
  );
  const sharesAsOf = f.shareClasses.classes[0]?.sharesAsOf;
  const bridge = computeEnterpriseValue({
    marketCap,
    debt: f.debt,
    cash: f.cash,
    preferred: f.evAdjustments.preferred,
    nci: f.evAdjustments.nci,
    balanceSheetDate: f.balanceSheet.date,
    ...(priceDate ? { priceDate } : {}),
    ...(sharesAsOf ? { sharesAsOf } : {}),
  });

  const single = classes.length === 1 ? classes[0] : undefined;
  const price: Metric | undefined = single?.quote
    ? {
        status: "reported",
        value: single.quote.close,
        unit: "USD/shares",
        period: { kind: "instant", end: single.quote.asOfDate },
        formula: `close (${single.quote.source})`,
        inputs: [],
        warnings: marketCap.warnings.filter((w) => w.code === "W_PRICE_STALE"),
      }
    : undefined;

  return {
    shareClasses: classes,
    needsPrice: classes.flatMap((c) =>
      c.ticker && !c.quote ? [c.ticker] : [],
    ),
    ...(price ? { price } : {}),
    bridge,
    multiples: computeMultiples({
      ev: bridge.enterpriseValue,
      revenue: f.metrics.revenue,
      ebitda: f.metrics.ebitda,
      // Without a usable single class, P/E carries market cap's Missing/Unsupported
      // reason; market cap is never used as a per-share price.
      price:
        price ??
        (single && !f.shareClasses.blocker
          ? single.equityValue
          : isUsable(marketCap)
            ? {
                status: "missing",
                reason: "no single priced class",
                warnings: [],
              }
            : marketCap),
      eps: f.metrics.dilutedEps,
      // The cover's class count, not the usable classes (one may have dropped
      // out); no cover count at all leaves P/E to the missing price.
      singleClass: f.shareClasses.coverClassCount <= 1,
      splitSinceLastAnnual: f.eps.splitSinceLastAnnual,
    }),
  };
}
