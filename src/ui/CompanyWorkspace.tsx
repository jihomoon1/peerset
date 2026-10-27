"use client";

import { useMemo, useState } from "react";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import type { QuoteSnapshot } from "@/domain/types";
import { priceCompany } from "@/domain/valuation";
import type { QuoteError } from "@/lib/quotes";
import { AsOfStrip } from "./AsOfStrip";
import { BalanceSheetBlock } from "./BalanceSheetBlock";
import { OperatingBlock } from "./OperatingBlock";
import {
  byListingOrder,
  parsePastedPrices,
  providerPriceDate,
  quotesFromInputs,
} from "./pricing";
import { ValuationBlock } from "./ValuationBlock";

// Holds the page's price inputs, so the as-of strip and the valuation block read the
// same quotes. Every edit reprices in the browser with priceCompany (blueprint §13).
export function CompanyWorkspace({
  f,
  pulledAt,
  analysisDate,
  providerQuotes,
  providerErrors,
  providerOn,
}: {
  f: CompanyFundamentals;
  pulledAt: string;
  analysisDate: string; // the server's date; price dates may not be after it
  providerQuotes: QuoteSnapshot[]; // Alpha Vantage mode only; editable pre-fills
  providerErrors: QuoteError[];
  providerOn: boolean;
}) {
  const tickers = byListingOrder(
    f.identity,
    f.shareClasses.classes.flatMap((c) => (c.ticker ? [c.ticker] : [])),
    (t) => t,
  );
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      tickers.map((t) => [
        t,
        providerQuotes.find((q) => q.symbol === t)?.close.toString() ?? "",
      ]),
    ),
  );
  const [priceDate, setPriceDate] = useState(
    providerPriceDate(providerQuotes) ?? analysisDate,
  );
  const [retrievedAt, setRetrievedAt] = useState(pulledAt);

  const priced = useMemo(() => {
    const q = quotesFromInputs({
      inputs,
      priceDate,
      analysisDate,
      retrievedAt,
      providerQuotes,
    });
    return { ...q, v: priceCompany(f, q.quotes, analysisDate) };
  }, [inputs, priceDate, analysisDate, retrievedAt, providerQuotes, f]);

  const touch = () => setRetrievedAt(new Date().toISOString());

  return (
    <>
      <AsOfStrip
        f={f}
        pulledAt={pulledAt}
        quotes={priced.quotes}
        priceDate={priced.v.bridge.dates.price}
        providerOn={providerOn}
      />
      <OperatingBlock f={f} />
      <BalanceSheetBlock f={f} />
      <ValuationBlock
        f={f}
        v={priced.v}
        tickers={tickers}
        inputs={inputs}
        errors={priced.errors}
        priceDate={priceDate}
        dateError={priced.dateError}
        analysisDate={analysisDate}
        providerErrors={providerErrors}
        onInput={(t, text) => {
          touch();
          setInputs((cur) => ({ ...cur, [t]: text }));
        }}
        onDate={(d) => {
          touch();
          setPriceDate(d);
        }}
        onPaste={(text) => {
          const { prices, unmatched } = parsePastedPrices(text, tickers);
          if (Object.keys(prices).length > 0) {
            touch();
            setInputs((cur) => ({ ...cur, ...prices }));
          }
          return unmatched;
        }}
      />
    </>
  );
}
