// Prices one company: fundamentals + quotes → share-class capitalization, the EV
// bridge and the three multiples. Pure and isomorphic (blueprint §13): the server and
// the browser call this same function, so entering a price recomputes instantly and
// the export (M5) recomputes the same numbers. M4's comps.ts calls it per company.

import { priceTicker } from "./capitalization";
import {
  computeEnterpriseValue,
  computeMarketCap,
  priceStaleWarnings,
  type EnterpriseValueBridge,
  type ShareClassCapitalization,
} from "./enterpriseValue";
import type { CompanyFundamentals } from "./fundamentals";
import { formatPercent } from "@/lib/format";
import { millions } from "./balanceSheet";
import {
  computeBookMultiples,
  computeMcapToDigitalAssets,
  computeMultiples,
  type Multiples,
} from "./multiples";
import { isUsable, mergeWarnings } from "./metrics/common";
import { DIGITAL_ASSETS_MATERIALITY } from "./policy";
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
  const computed = computeEnterpriseValue({
    marketCap,
    debt: f.debt,
    cash: f.cash,
    preferred: f.evAdjustments.preferred,
    nci: f.evAdjustments.nci,
    balanceSheetDate: f.balanceSheet.date,
    ...(priceDate ? { priceDate } : {}),
    ...(sharesAsOf ? { sharesAsOf } : {}),
  });
  const bridge = adjustBridgeForKind(f, computed, marketCap);

  const single = classes.length === 1 ? classes[0] : undefined;
  const price: Metric | undefined = single?.quote
    ? {
        status: "reported",
        value: single.quote.close,
        unit: "USD/shares",
        period: { kind: "instant", end: single.quote.asOfDate },
        formula: `close (${single.quote.source})`,
        inputs: [],
        // From the quote itself: a share-class blocker leaves market cap without it.
        warnings: priceStaleWarnings([single.quote], analysisDate),
      }
    : undefined;

  const multiples = computeMultiples({
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
    epsBasis: f.eps.basis,
    // The cover's class count, not the usable classes (one may have dropped
    // out); no cover count at all leaves P/E to the missing price.
    singleClass: f.shareClasses.coverClassCount <= 1,
    splitSinceLastAnnual: f.eps.splitSinceLastAnnual,
  });
  if (f.digital)
    multiples.mcapToDigitalAssets = computeMcapToDigitalAssets(
      marketCap,
      f.digital.digitalAssets.metric,
      f.balanceSheet.date,
    );
  if (f.bank)
    Object.assign(
      multiples,
      computeBookMultiples(
        marketCap,
        f.bank.commonEquity.metric,
        f.bank.tangibleCommonEquity.metric,
      ),
    );

  return {
    shareClasses: classes,
    needsPrice: [
      ...new Set(
        classes.flatMap((c) => {
          const t = priceTicker(c);
          return t && !c.quote ? [t] : [];
        }),
      ),
    ],
    ...(price ? { price } : {}),
    bridge,
    multiples,
  };
}

// §13B–§13D (0.5.0): a bank's EV is Unsupported; a digital-asset company's EV warns
// when digital assets above 5% of market cap are left out of it.
function adjustBridgeForKind(
  f: CompanyFundamentals,
  bridge: EnterpriseValueBridge,
  marketCap: Metric,
): EnterpriseValueBridge {
  if (f.kind === "bank")
    return {
      ...bridge,
      enterpriseValue: {
        status: "unsupported",
        reason: {
          code: "NOT_FOR_BANKS",
          message:
            "banks are valued on equity: EV doesn't apply (deposits are operating liabilities)",
        },
        warnings: [],
      },
    };
  const da = f.digital?.digitalAssets.metric;
  const ev = bridge.enterpriseValue;
  if (
    da &&
    isUsable(da) &&
    isUsable(ev) &&
    isUsable(marketCap) &&
    marketCap.value > 0 &&
    da.value / marketCap.value > DIGITAL_ASSETS_MATERIALITY
  )
    return {
      ...bridge,
      enterpriseValue: {
        ...ev,
        warnings: mergeWarnings(ev.warnings, [
          {
            code: "W_DIGITAL_ASSETS_NOT_IN_EV",
            message: `digital assets of ${millions(da.value)} (${formatPercent(da.value / marketCap.value)} of market cap) are not subtracted in EV`,
            severity: "caution",
          },
        ]),
      },
    };
  return bridge;
}
