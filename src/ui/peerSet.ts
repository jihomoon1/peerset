// The peer set (M4b): suggested peers from /api/peers, plus tickers the analyst added,
// minus those removed, at most PEERS.max. Pure, so the workbench, the URL and the
// tests agree on it. Whether an added ticker is a real, supported company is learned
// when its fundamentals load; an unknown or unsupported one never enters the table.

import { PEERS } from "@/domain/policy";
import { parseTickerInput } from "@/lib/ticker";

export interface PeerSetState {
  target: string;
  suggested: { ticker: string; reason: string }[];
  added: string[];
  removed: string[];
}

export interface ActivePeer {
  ticker: string;
  origin: "suggested" | "added";
  reason: string;
}

export const ADDED_REASON = "Added by you";

function candidates(s: PeerSetState): ActivePeer[] {
  const seen = new Set<string>([s.target]);
  const out: ActivePeer[] = [];
  for (const p of s.suggested)
    if (!seen.has(p.ticker)) {
      seen.add(p.ticker);
      out.push({ ticker: p.ticker, origin: "suggested", reason: p.reason });
    }
  for (const t of s.added)
    if (!seen.has(t)) {
      seen.add(t);
      out.push({ ticker: t, origin: "added", reason: ADDED_REASON });
    }
  return out;
}

export function activePeers(s: PeerSetState): ActivePeer[] {
  return candidates(s)
    .filter((p) => !s.removed.includes(p.ticker))
    .slice(0, PEERS.max);
}

export function removedPeers(s: PeerSetState): ActivePeer[] {
  return candidates(s).filter((p) => s.removed.includes(p.ticker));
}

export type AddResult =
  { ok: true; state: PeerSetState } | { ok: false; message: string };

export function addPeer(s: PeerSetState, raw: string): AddResult {
  const input = parseTickerInput(raw);
  if (!input.ok) return input;
  const t = input.ticker;
  if (t === s.target)
    return { ok: false, message: `${t} is the company being analyzed` };
  if (s.removed.includes(t)) return { ok: true, state: restorePeer(s, t) };
  if (activePeers(s).some((p) => p.ticker === t))
    return { ok: false, message: `${t} is already in the peer set` };
  if (activePeers(s).length >= PEERS.max)
    return {
      ok: false,
      message: `At most ${PEERS.max} peers; remove one first`,
    };
  return { ok: true, state: { ...s, added: [...s.added, t] } };
}

// An added peer is simply dropped; a suggested one goes on the removed list, where
// it can be restored.
export function removePeer(s: PeerSetState, ticker: string): PeerSetState {
  if (s.added.includes(ticker) && !s.suggested.some((p) => p.ticker === ticker))
    return { ...s, added: s.added.filter((t) => t !== ticker) };
  return s.removed.includes(ticker)
    ? s
    : { ...s, removed: [...s.removed, ticker] };
}

export function restorePeer(s: PeerSetState, ticker: string): PeerSetState {
  if (activePeers(s).length >= PEERS.max) return s;
  return { ...s, removed: s.removed.filter((t) => t !== ticker) };
}
