"use client";

// Loads peer fundamentals in the browser through /api/fundamentals, at most
// PEER_LOAD_CONCURRENCY at a time (ADR 0009: 3 in flight × 2.5 SEC requests per
// second per instance stays under SEC's limit even if each lands on its own
// instance). Each ticker is fetched once per page view; removing and restoring a
// peer reuses its result. The browser never calls SEC.

import { useEffect, useRef, useState } from "react";
import type { PeerState } from "@/domain/comps";
import type { CompanyFundamentals } from "@/domain/fundamentals";

export const PEER_LOAD_CONCURRENCY = 3;

// A failure the analyst should see next to the add box rather than as a table row:
// the ticker isn't an SEC company, or PeerSet can't analyze it (e.g. files 20-F).
export const NOT_A_PEER_CODES = new Set([
  "TICKER_NOT_FOUND",
  "UNSUPPORTED_ISSUER",
]);

async function fetchPeer(
  ticker: string,
  signal: AbortSignal,
): Promise<PeerState> {
  try {
    const res = await fetch(
      `/api/fundamentals?ticker=${encodeURIComponent(ticker)}`,
      { signal },
    );
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && body && typeof body === "object" && "identity" in body)
      return { kind: "loaded", fundamentals: body as CompanyFundamentals };
    const err = (body ?? {}) as { code?: unknown; message?: unknown };
    return {
      kind: "failed",
      code: typeof err.code === "string" ? err.code : `HTTP_${res.status}`,
      message:
        typeof err.message === "string"
          ? err.message
          : `the server answered ${res.status}`,
    };
  } catch (e) {
    if (signal.aborted) throw e;
    return {
      kind: "failed",
      code: "NETWORK",
      message: "the request didn't complete; check your connection",
    };
  }
}

export function usePeerLoader(
  tickers: readonly string[],
): Record<string, PeerState> {
  const [states, setStates] = useState<Record<string, PeerState>>({});
  const done = useRef(new Set<string>());
  const queued = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const inFlight = useRef(0);
  const controller = useRef<AbortController | null>(null);

  // On unmount (and React's development remount) abort what is in flight and forget
  // the queue, so a remount starts it again.
  useEffect(() => {
    controller.current = new AbortController();
    const c = controller.current;
    const queuedSet = queued.current;
    return () => {
      c.abort();
      queuedSet.clear();
      queue.current = [];
      inFlight.current = 0;
    };
  }, []);

  // Keyed on the joined tickers, so a new array with the same tickers is no change.
  const key = tickers.join(",");
  useEffect(() => {
    const signal = controller.current?.signal;
    if (!signal) return;
    const pump = () => {
      while (inFlight.current < PEER_LOAD_CONCURRENCY && queue.current.length) {
        const t = queue.current.shift()!;
        inFlight.current++;
        fetchPeer(t, signal)
          .then((state) => {
            done.current.add(t);
            setStates((cur) => ({ ...cur, [t]: state }));
          })
          .catch(() => {}) // aborted: the page is gone
          .finally(() => {
            if (signal.aborted) return;
            inFlight.current--;
            pump();
          });
      }
    };
    for (const t of key ? key.split(",") : [])
      if (!queued.current.has(t) && !done.current.has(t)) {
        queued.current.add(t);
        queue.current.push(t);
      }
    pump();
  }, [key]);

  return Object.fromEntries(
    tickers.map((t) => [t, states[t] ?? { kind: "loading" }]),
  );
}
