"use client";

// The peer panel (blueprint §6, §10.3): add box at the top, the SIC matches with
// their reasons and tier, removed peers with Restore, and every exclusion with its
// code: screening exclusions and peers that failed to load. It says "SIC matches",
// never "the peers": SIC misses real competitors (Trane, Watsco for LII).

import { useState } from "react";
import type { PeerState } from "@/domain/comps";
import type { ExclusionCode, ScreeningFunnelStep } from "@/domain/types";
import type { PeersResponse } from "@/lib/peers";
import type { ActivePeer } from "./peerSet";

export type PeerSelection =
  | { ok: true; data: PeersResponse }
  | { ok: false; code: string; message: string };

const EXCLUSION_TEXT: Record<ExclusionCode, string> = {
  NO_PERIODIC_FILING: "no 10-K or 10-Q",
  FOREIGN_FILER: "files 20-F or 40-F",
  TRANSITION_PERIOD: "transition-period report",
  FINANCIAL_SIC: "financial SIC (6000–6799)",
  STALE_FILING: "latest filing over 200 days old",
  NO_SCREENING_REVENUE: "no screening revenue",
  OUTSIDE_SIZE_RANGE: "revenue outside 0.2x–5x",
  NOT_IN_TOP_N: "ranked below the number kept",
};

const TIER_NAME = { sic4: "SIC", sic3: "3-digit group", sic2: "2-digit group" };

export function tierText(data: PeersResponse): string {
  const sic = data.target.sic;
  if (data.tier === "sic4") return `SIC ${sic} exact`;
  if (data.tier === "sic3")
    return `3-digit group ${sic.slice(0, 3)} — fewer than 5 exact matches`;
  return `2-digit group ${sic.slice(0, 2)} — fewer than 5 in group ${sic.slice(0, 3)}`;
}

function funnelLine(step: ScreeningFunnelStep): string {
  const dropped = Object.entries(step.dropped)
    .map(([code, n]) => `${n} ${EXCLUSION_TEXT[code as ExclusionCode]}`)
    .join(", ");
  return `${TIER_NAME[step.tier]} ${step.group}: ${step.companies} ${
    step.companies === 1 ? "company" : "companies"
  }${dropped ? `; dropped ${dropped}` : ""}; ${step.qualified} qualified`;
}

const btn =
  "rounded-sm border border-rule px-2 py-0.5 text-xs hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent";

export function PeerPanel({
  selection,
  active,
  removed,
  states,
  notAPeer,
  onAdd,
  onRemove,
  onRestore,
  onDismiss,
}: {
  selection: PeerSelection;
  active: ActivePeer[];
  removed: ActivePeer[];
  states: Record<string, PeerState>;
  notAPeer: { ticker: string; message: string }[];
  onAdd: (raw: string) => string | null; // an error message, or null when added
  onRemove: (ticker: string) => void;
  onRestore: (ticker: string) => void;
  onDismiss: (ticker: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const data = selection.ok ? selection.data : null;
  const failed = active.filter((p) => states[p.ticker]?.kind === "failed");

  return (
    <aside
      aria-labelledby="peer-panel-heading"
      className={`flex flex-col gap-4 text-[13px] ${collapsed ? "lg:w-auto" : "lg:w-80"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="peer-panel-heading" className="text-base font-semibold">
          Peers{" "}
          <span className="text-sm font-normal text-muted">
            ({active.length} in table)
          </span>
        </h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls="peer-panel-body"
          onClick={() => setCollapsed((c) => !c)}
          className={btn}
        >
          {collapsed ? "Show" : "Hide"}
          <span className="sr-only"> peer panel</span>
        </button>
      </div>

      <div
        id="peer-panel-body"
        hidden={collapsed}
        className="flex flex-col gap-4"
      >
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const err = onAdd(text);
            setError(err);
            if (!err) setText("");
          }}
        >
          <label htmlFor="add-peer" className="font-medium">
            Add a ticker
          </label>
          <div className="flex gap-2">
            <input
              id="add-peer"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "add-peer-error" : undefined}
              placeholder="e.g. TT"
              className="w-28 rounded-sm border border-rule bg-background px-2 py-1 uppercase focus-visible:outline-2 focus-visible:outline-accent"
            />
            <button
              type="submit"
              className="rounded-sm bg-accent px-3 py-1 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Add
            </button>
          </div>
          {error && (
            <span id="add-peer-error" className="text-error">
              {error}
            </span>
          )}
          {notAPeer.map((n) => (
            <span key={n.ticker} role="status" className="text-error">
              {n.ticker} can&apos;t be added: {n.message}{" "}
              <button
                type="button"
                className={btn}
                onClick={() => onDismiss(n.ticker)}
              >
                Dismiss<span className="sr-only"> {n.ticker}</span>
              </button>
            </span>
          ))}
        </form>

        <section
          aria-labelledby="sic-matches-heading"
          className="flex flex-col gap-2"
        >
          <h3 id="sic-matches-heading" className="font-semibold">
            SIC matches
          </h3>
          {!selection.ok ? (
            <p className="text-warn">
              Peer screening unavailable: {selection.message}
            </p>
          ) : (
            <p className="text-muted">
              {tierText(selection.data)}. Screened on revenue in the latest
              fiscal year (0.2x–5x {selection.data.target.ticker}). SIC codes
              miss some competitors: add them above.
            </p>
          )}
          {data && data.selected.length === 0 && (
            <div role="status" className="flex flex-col gap-1">
              <p className="font-medium">No peers passed the screen.</p>
              <ul className="list-disc pl-5 text-muted">
                {data.funnel.map((f) => (
                  <li key={f.tier}>{funnelLine(f)}</li>
                ))}
              </ul>
            </div>
          )}
          {active.length > 0 && (
            <ul className="flex flex-col gap-2">
              {active.map((p) => {
                const s = states[p.ticker];
                return (
                  <li
                    key={p.ticker}
                    className="flex items-start justify-between gap-2"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {p.ticker}
                        {s?.kind === "loaded" && (
                          <span className="font-normal text-muted">
                            {" "}
                            · {s.fundamentals.identity.name}
                          </span>
                        )}
                      </span>
                      <span className="text-muted">{p.reason}</span>
                      {s?.kind === "loading" && (
                        <span className="text-muted">Loading…</span>
                      )}
                      {s?.kind === "failed" && (
                        <span className="text-error">
                          {s.code === "UNSUPPORTED_ISSUER"
                            ? "Unsupported"
                            : "Failed"}
                          : {s.message}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => onRemove(p.ticker)}
                    >
                      Remove<span className="sr-only"> {p.ticker}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {removed.length > 0 && (
          <section
            aria-labelledby="removed-heading"
            className="flex flex-col gap-2"
          >
            <h3 id="removed-heading" className="font-semibold">
              Removed
            </h3>
            <ul className="flex flex-col gap-1">
              {removed.map((p) => (
                <li
                  key={p.ticker}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    <span className="font-medium">{p.ticker}</span>{" "}
                    <span className="text-muted">{p.reason}</span>
                  </span>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => onRestore(p.ticker)}
                  >
                    Restore<span className="sr-only"> {p.ticker}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-labelledby="excluded-heading"
          className="flex flex-col gap-2"
        >
          <h3 id="excluded-heading" className="font-semibold">
            Excluded{" "}
            <span className="font-normal text-muted">
              ({(data?.excluded.length ?? 0) + failed.length})
            </span>
          </h3>
          {failed.length > 0 && (
            <ul className="flex flex-col gap-1">
              {failed.map((p) => {
                const s = states[p.ticker] as Extract<
                  PeerState,
                  { kind: "failed" }
                >;
                return (
                  <li key={p.ticker}>
                    <span className="font-medium">{p.ticker}</span>{" "}
                    <code className="text-xs">{s.code}</code>: failed to load,{" "}
                    {s.message}
                  </li>
                );
              })}
            </ul>
          )}
          {data && data.excluded.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-muted">
                Screening exclusions ({data.excluded.length})
              </summary>
              <ul className="mt-1 flex flex-col gap-1">
                {data.excluded.map((e) => (
                  <li key={e.cik}>
                    <span className="font-medium">{e.ticker}</span>{" "}
                    <code className="text-xs">{e.code}</code>: {e.detail}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            failed.length === 0 && <p className="text-muted">None</p>
          )}
        </section>
      </div>
    </aside>
  );
}
