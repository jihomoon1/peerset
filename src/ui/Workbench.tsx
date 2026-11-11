"use client";

// The comps workbench (blueprint §6): the target summary (as-of strip, operating,
// balance-sheet and valuation blocks), then the peer panel beside the comps table.
// Holds the peer set, every price input and the shared price date, mirrors them into
// the URL, and recomputes the whole table in the browser on every change with the
// same domain code the server uses (blueprint §13). Nothing is stored on a server.
// Price autofill (v1.1) fills inputs from the user's own browser with the user's own
// Alpha Vantage key; filled prices are user inputs like typed ones.

import { useEffect, useRef, useState } from "react";
import { buildComps, type CompsPeer } from "@/domain/comps";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import type { QuoteSnapshot } from "@/domain/types";
import { formatDate } from "@/lib/format";
import type { QuoteError } from "@/lib/quotes";
import { browserStorage } from "@/prices/browserAlphaVantage";
import {
  removeTypedPrice,
  restorePrices,
  saveTypedPrice,
} from "@/prices/savedPrices";
import { AsOfStrip } from "./AsOfStrip";
import { BalanceSheetBlock } from "./BalanceSheetBlock";
import { CompsTable } from "./CompsTable";
import { ExportButton } from "./ExportButton";
import { exportState } from "./exportRequest";
import { ImpliedValuationBlock } from "./ImpliedValuationBlock";
import { OperatingBlock } from "./OperatingBlock";
import { PeerPanel, type PeerSelection } from "./PeerPanel";
import { TableKey } from "./TableKey";
import {
  activePeers,
  addPeer,
  NOT_A_PEER_CODES,
  removedPeers,
  removePeer,
  restorePeer,
  type PeerSetState,
} from "./peerSet";
import { PriceAutofill } from "./PriceAutofill";
import { PricesBlock } from "./PricesBlock";
import {
  byListingOrder,
  parsePastedPrices,
  priceNumber,
  providerPriceDate,
  quotesFromInputs,
  type FilledPrice,
} from "./pricing";
import { usePeerLoader } from "./usePeerLoader";
import { urlQuery, type WorkbenchUrlState } from "./urlState";
import { ValuationBlock } from "./ValuationBlock";

const listedTickers = (f: CompanyFundamentals) =>
  byListingOrder(
    f.identity,
    f.shareClasses.classes.flatMap((c) => (c.ticker ? [c.ticker] : [])),
    (t) => t,
  );

export function Workbench({
  f,
  pulledAt,
  analysisDate,
  providerQuotes,
  providerErrors,
  providerOn,
  selection,
  initial,
}: {
  f: CompanyFundamentals;
  pulledAt: string;
  analysisDate: string; // the server's date; price dates may not be after it
  providerQuotes: QuoteSnapshot[]; // Alpha Vantage mode only; editable pre-fills
  providerErrors: QuoteError[];
  providerOn: boolean;
  selection: PeerSelection;
  initial: WorkbenchUrlState;
}) {
  const targetTickers = listedTickers(f);
  const [peerSet, setPeerSet] = useState<PeerSetState>(() => ({
    target: f.identity.ticker,
    suggested: selection.ok
      ? selection.data.selected.map((p) => ({
          ticker: p.ticker,
          reason: p.reason,
        }))
      : [],
    added: initial.add,
    removed: initial.remove,
  }));
  const [inputs, setInputs] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(
      targetTickers.map((t) => [
        t,
        providerQuotes.find((q) => q.symbol === t)?.close.toString() ?? "",
      ]),
    ),
    ...initial.prices,
  }));
  const [priceDate, setPriceDate] = useState(
    initial.priceDate ?? providerPriceDate(providerQuotes) ?? analysisDate,
  );
  // Prices filled from Alpha Vantage with the user's key, restored from pxav=.
  const [filled, setFilled] = useState<Record<string, FilledPrice>>(() =>
    Object.fromEntries(
      Object.entries(initial.filled ?? {}).flatMap(([t, asOfDate]) =>
        initial.prices[t]
          ? [[t, { close: priceNumber(initial.prices[t]), asOfDate }]]
          : [],
      ),
    ),
  );
  const [retrievedAt, setRetrievedAt] = useState(pulledAt);
  const touch = () => setRetrievedAt(new Date().toISOString());

  const active = activePeers(peerSet);
  const states = usePeerLoader(active.map((p) => p.ticker));

  // An added ticker that isn't an SEC company, or that PeerSet can't analyze, never
  // enters the table: its reason shows next to the add box instead.
  const notAPeer = active.flatMap((p) => {
    const s = states[p.ticker];
    return p.origin === "added" &&
      s?.kind === "failed" &&
      NOT_A_PEER_CODES.has(s.code)
      ? [{ ticker: p.ticker, message: s.message }]
      : [];
  });
  const compsPeers: CompsPeer[] = active
    .filter((p) => !notAPeer.some((n) => n.ticker === p.ticker))
    .map((p) => ({ ...p, state: states[p.ticker] ?? { kind: "loading" } }));

  // Blueprint §6 "Loading": the progress line names a filing being read (M6). A
  // suggested peer's latest filing comes from the peer index; an added one is named
  // only by ticker until its fundamentals arrive.
  const reading = compsPeers.find((p) => p.state.kind === "loading");
  const readingFiling =
    reading && selection.ok
      ? selection.data.selected.find((s) => s.ticker === reading.ticker)?.latest
      : undefined;
  const readingText = reading
    ? readingFiling
      ? `Reading ${reading.ticker}'s ${readingFiling.form} filed ${formatDate(readingFiling.filedDate)}…`
      : `Reading ${reading.ticker}'s latest 10-K or 10-Q…`
    : "";

  // Cheap (at most 13 rows), so recomputed on every render: always in step with the
  // inputs, the peer states and the active set.
  const q = quotesFromInputs({
    inputs,
    priceDate,
    analysisDate,
    retrievedAt,
    providerQuotes,
    filled,
  });
  const priced = {
    ...q,
    table: buildComps(f, compsPeers, q.quotes, analysisDate),
  };
  const { table } = priced;

  // The URL mirrors the state, so the analysis is shareable by link.
  useEffect(() => {
    const prices = Object.fromEntries(
      Object.entries(inputs).filter(([, v]) => v.trim()),
    );
    const filledInUse = Object.fromEntries(
      Object.entries(filled).flatMap(([t, fp]) =>
        prices[t] && priceNumber(prices[t]) === fp.close
          ? [[t, fp.asOfDate]]
          : [],
      ),
    );
    const state = {
      add: peerSet.added,
      remove: peerSet.removed,
      prices,
      ...(Object.keys(prices).length ? { priceDate } : {}),
      ...(Object.keys(filledInUse).length ? { filled: filledInUse } : {}),
    };
    // A link that carries an analysis also names the company it was made for (M6).
    const query = urlQuery(
      urlQuery(state) ? { cik: f.identity.cik, ...state } : state,
    );
    const url = `${window.location.pathname}${query}`;
    if (url !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(window.history.state, "", url);
  }, [
    f.identity.cik,
    peerSet.added,
    peerSet.removed,
    inputs,
    priceDate,
    filled,
  ]);

  const pasteTickers = [
    ...targetTickers,
    ...table.peers.flatMap((r) =>
      r.fundamentals ? listedTickers(r.fundamentals) : [r.ticker],
    ),
  ];
  const { counts } = table;

  // One price box changed by hand. Clearing it also forgets its saved price.
  const onPrice = (t: string, text: string) => {
    touch();
    if (!text.trim()) removeTypedPrice(browserStorage(), t);
    setInputs((cur) => ({ ...cur, [t]: text }));
  };

  // Typed prices are kept in this browser with their price date (savedPrices.ts);
  // key-filled ones already live in the quote cache with their own date.
  useEffect(() => {
    if (priceDate > analysisDate) return;
    const storage = browserStorage();
    for (const [t, v] of Object.entries(inputs)) {
      if (!v.trim()) continue;
      const n = priceNumber(v);
      if (filled[t]?.close === n) continue;
      if (providerQuotes.some((x) => x.symbol === t && x.close === n)) continue;
      saveTypedPrice(storage, t, v, priceDate);
    }
  }, [inputs, priceDate, filled, analysisDate, providerQuotes]);

  // The first time a ticker shows up with an empty price box, put back the price this
  // browser has for it. Each ticker is tried once, so a box the user clears stays
  // empty, and a price already on the page (typed, pasted or from the link) is kept.
  const tried = useRef(new Set<string>());
  const [restored, setRestored] = useState(0);
  const restoreNote =
    restored > 0
      ? `Put back ${restored} saved price${restored === 1 ? "" : "s"} from this browser.`
      : "";
  const tickersKey = pasteTickers.join(",");
  useEffect(() => {
    const fresh = tickersKey
      .split(",")
      .filter((t) => t && !tried.current.has(t));
    if (fresh.length === 0) return;
    fresh.forEach((t) => tried.current.add(t));
    const isFilled = (t: string, v: string) =>
      filled[t]?.close === priceNumber(v);
    const typedInUse = Object.entries(inputs).some(
      ([t, v]) => v.trim() && !isFilled(t, v),
    );
    const r = restorePrices({
      storage: browserStorage(),
      tickers: fresh.filter((t) => !inputs[t]?.trim()),
      typedDate: typedInUse ? priceDate : null,
      analysisDate,
      now: new Date(),
    });
    const n = Object.keys(r.inputs).length;
    if (n === 0) return;
    setRetrievedAt(new Date().toISOString());
    setInputs((cur) => ({ ...cur, ...r.inputs }));
    setFilled((cur) => ({ ...cur, ...r.filled }));
    const filledDates = [
      ...Object.values(r.filled),
      ...Object.entries(filled)
        .filter(([t]) => inputs[t]?.trim())
        .map(([, fp]) => fp),
    ].map((fp) => fp.asOfDate);
    if (r.priceDate) setPriceDate(r.priceDate);
    // Only key-filled prices on the page: the shared date shows the earliest close.
    else if (
      !typedInUse &&
      n === Object.keys(r.filled).length &&
      filledDates.length > 0
    )
      setPriceDate(filledDates.reduce((a, b) => (a < b ? a : b)));
    setRestored((prev) => prev + n);
  }, [tickersKey, inputs, filled, priceDate, analysisDate]);

  // The export sends these inputs; the server recomputes the same table (§13).
  const exporting = exportState({
    target: f.identity.ticker,
    added: peerSet.added,
    removed: peerSet.removed,
    table,
    quotes: priced.quotes,
    priceDate,
    ...(priced.dateError ? { dateError: priced.dateError } : {}),
  });

  return (
    <>
      <ExportButton state={exporting} />
      <AsOfStrip
        f={f}
        pulledAt={pulledAt}
        quotes={priced.quotes}
        priceDate={table.target.valuation!.bridge.dates.price}
        providerOn={providerOn}
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <OperatingBlock f={f} />
        <BalanceSheetBlock f={f} />
        <ValuationBlock
          f={f}
          v={table.target.valuation!}
          tickers={targetTickers}
          inputs={inputs}
          errors={priced.errors}
          providerErrors={providerErrors}
          onInput={onPrice}
        />
      </div>

      <PricesBlock
        priceDate={priceDate}
        dateError={priced.dateError}
        analysisDate={analysisDate}
        note={restoreNote}
        onDate={(d) => {
          touch();
          setPriceDate(d);
        }}
        onPaste={(text) => {
          const { prices, unmatched } = parsePastedPrices(text, pasteTickers);
          if (Object.keys(prices).length > 0) {
            touch();
            setInputs((cur) => ({ ...cur, ...prices }));
          }
          return unmatched;
        }}
      >
        <PriceAutofill
          tickers={pasteTickers}
          inputs={inputs}
          disabledReason={
            counts.loading > 0
              ? "Wait until every peer has finished loading"
              : null
          }
          onQuote={(quote) => {
            touch();
            setInputs((cur) => ({
              ...cur,
              [quote.symbol]: String(quote.close),
            }));
            setFilled((cur) => ({
              ...cur,
              [quote.symbol]: {
                close: quote.close,
                asOfDate: quote.asOfDate,
              },
            }));
          }}
          onDone={(quotes) => {
            if (quotes.length === 0) return;
            // When every entered price now carries its own bar date, the shared date
            // shows the earliest of them (methodology §6); typed prices keep theirs.
            const done = new Set(quotes.map((x) => x.symbol));
            const typedLeft = Object.entries(inputs).some(
              ([t, v]) =>
                v.trim() &&
                !done.has(t) &&
                !(filled[t] && filled[t].close === priceNumber(v)),
            );
            if (!typedLeft) {
              const dates = [
                ...quotes.map((x) => x.asOfDate),
                ...Object.entries(filled)
                  .filter(([t]) => !done.has(t) && inputs[t]?.trim())
                  .map(([, fp]) => fp.asOfDate),
              ];
              setPriceDate(dates.reduce((a, b) => (a < b ? a : b)));
            }
          }}
        />
      </PricesBlock>

      <section aria-labelledby="comps-heading" className="flex flex-col gap-3">
        <h2 id="comps-heading" className="section-bar">
          Trading comps
        </h2>
        <p role="status" aria-live="polite" className="text-[13px]">
          {counts.peers === 0 ? (
            <span className="text-muted">
              No peers in the table yet. Add a ticker in the peer panel.
            </span>
          ) : counts.loading > 0 ? (
            <span className="text-muted">
              Loading peers: {counts.loaded + counts.failed} of {counts.peers}{" "}
              done. {readingText}
            </span>
          ) : counts.failed > 0 ? (
            <span className="text-warn">
              {counts.loaded} of {counts.peers} peers loaded; {counts.failed}{" "}
              failed (
              <a href="#excluded-heading" className="underline">
                details
              </a>
              ).
            </span>
          ) : (
            <span className="text-muted">
              {counts.loaded} of {counts.peers} peers loaded. Statistics are
              over peers only; the target is excluded.
            </span>
          )}
        </p>
        <CompsTable
          table={table}
          inputs={inputs}
          errors={priced.errors}
          onInput={onPrice}
        />
        <TableKey />
        <ImpliedValuationBlock table={table} />
        <PeerPanel
          selection={selection}
          active={active}
          removed={removedPeers(peerSet)}
          states={states}
          notAPeer={notAPeer}
          onAdd={(raw) => {
            const r = addPeer(peerSet, raw);
            if (!r.ok) return r.message;
            setPeerSet(r.state);
            return null;
          }}
          onRemove={(t) => setPeerSet((s) => removePeer(s, t))}
          onRestore={(t) => setPeerSet((s) => restorePeer(s, t))}
          onDismiss={(t) => setPeerSet((s) => removePeer(s, t))}
        />
      </section>
    </>
  );
}
