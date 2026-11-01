"use client";

// The comps workbench (blueprint §6): the target summary (as-of strip, operating,
// balance-sheet and valuation blocks), then the peer panel beside the comps table.
// Holds the peer set, every price input and the shared price date, mirrors them into
// the URL, and recomputes the whole table in the browser on every change with the
// same domain code the server uses (blueprint §13). Nothing is stored on a server.

import { useEffect, useState } from "react";
import { buildComps, type CompsPeer } from "@/domain/comps";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import type { QuoteSnapshot } from "@/domain/types";
import type { QuoteError } from "@/lib/quotes";
import { AsOfStrip } from "./AsOfStrip";
import { BalanceSheetBlock } from "./BalanceSheetBlock";
import { CompsTable } from "./CompsTable";
import { ExportButton } from "./ExportButton";
import { exportState } from "./exportRequest";
import { ImpliedValuationBlock } from "./ImpliedValuationBlock";
import { OperatingBlock } from "./OperatingBlock";
import { PeerPanel, type PeerSelection } from "./PeerPanel";
import {
  activePeers,
  addPeer,
  NOT_A_PEER_CODES,
  removedPeers,
  removePeer,
  restorePeer,
  type PeerSetState,
} from "./peerSet";
import {
  byListingOrder,
  parsePastedPrices,
  providerPriceDate,
  quotesFromInputs,
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

  // Cheap (at most 13 rows), so recomputed on every render: always in step with the
  // inputs, the peer states and the active set.
  const q = quotesFromInputs({
    inputs,
    priceDate,
    analysisDate,
    retrievedAt,
    providerQuotes,
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
    const query = urlQuery({
      add: peerSet.added,
      remove: peerSet.removed,
      prices,
      ...(Object.keys(prices).length ? { priceDate } : {}),
    });
    const url = `${window.location.pathname}${query}`;
    if (url !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(window.history.state, "", url);
  }, [peerSet.added, peerSet.removed, inputs, priceDate]);

  const pasteTickers = [
    ...targetTickers,
    ...table.peers.flatMap((r) =>
      r.fundamentals ? listedTickers(r.fundamentals) : [r.ticker],
    ),
  ];
  const { counts } = table;

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
      <OperatingBlock f={f} />
      <BalanceSheetBlock f={f} />
      <ValuationBlock
        f={f}
        v={table.target.valuation!}
        tickers={targetTickers}
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
          const { prices, unmatched } = parsePastedPrices(text, pasteTickers);
          if (Object.keys(prices).length > 0) {
            touch();
            setInputs((cur) => ({ ...cur, ...prices }));
          }
          return unmatched;
        }}
      />

      <section aria-labelledby="comps-heading" className="flex flex-col gap-3">
        <h2 id="comps-heading" className="text-base font-semibold">
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
              done.
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
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
          <div className="flex min-w-0 flex-col gap-6">
            <CompsTable
              table={table}
              inputs={inputs}
              errors={priced.errors}
              onInput={(t, text) => {
                touch();
                setInputs((cur) => ({ ...cur, [t]: text }));
              }}
            />
            <ImpliedValuationBlock table={table} />
          </div>
        </div>
      </section>
    </>
  );
}
