import { describe, expect, it } from "vitest";
import {
  activePeers,
  addPeer,
  removedPeers,
  removePeer,
  restorePeer,
  type PeerSetState,
} from "@/ui/peerSet";

// The peer set = suggested peers (from /api/peers) + added tickers − removed ones,
// at most 12 (policy PEERS.max). Pure, so the workbench and its tests share it.

const suggested = [
  { ticker: "MIDD", reason: "SIC 3580 · 3-digit group 358 · revenue 0.6x" },
  { ticker: "AAON", reason: "SIC 3585 · 3-digit group 358 · revenue 0.3x" },
];
const base: PeerSetState = {
  target: "LII",
  suggested,
  added: [],
  removed: [],
};

describe("activePeers", () => {
  it("lists suggested peers, then added ones with 'Added by you'", () => {
    expect(activePeers({ ...base, added: ["TT"] })).toEqual([
      { ticker: "MIDD", origin: "suggested", reason: suggested[0].reason },
      { ticker: "AAON", origin: "suggested", reason: suggested[1].reason },
      { ticker: "TT", origin: "added", reason: "Added by you" },
    ]);
  });

  it("leaves out removed peers, whether suggested or added", () => {
    const s = { ...base, added: ["TT"], removed: ["MIDD", "TT"] };
    expect(activePeers(s).map((p) => p.ticker)).toEqual(["AAON"]);
    expect(removedPeers(s).map((p) => p.ticker)).toEqual(["MIDD", "TT"]);
  });

  it("never lists the target or the same ticker twice", () => {
    const s = { ...base, added: ["LII", "AAON", "TT", "TT"] };
    expect(activePeers(s).map((p) => p.ticker)).toEqual(["MIDD", "AAON", "TT"]);
  });

  it("caps the set at 12", () => {
    const added = Array.from({ length: 14 }, (_, i) => `X${i}`);
    expect(activePeers({ ...base, added })).toHaveLength(12);
  });
});

describe("addPeer", () => {
  it("adds a new ticker, uppercased", () => {
    const r = addPeer(base, " tt ");
    expect(r).toEqual({ ok: true, state: { ...base, added: ["TT"] } });
  });

  it("restores a removed peer instead of adding it again", () => {
    const r = addPeer({ ...base, removed: ["MIDD"] }, "MIDD");
    expect(r).toEqual({ ok: true, state: base });
  });

  it.each([
    ["", "Enter a ticker, for example LII"],
    ["1BAD", /1–10 letters/],
    ["LII", "LII is the company being analyzed"],
    ["AAON", "AAON is already in the peer set"],
  ])("refuses %j", (input, message) => {
    const r = addPeer(base, input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(message);
  });

  it("refuses a 13th peer", () => {
    const added = Array.from({ length: 10 }, (_, i) => `X${i}`);
    const r = addPeer({ ...base, added }, "TT");
    expect(r).toEqual({
      ok: false,
      message: "At most 12 peers; remove one first",
    });
  });
});

describe("removePeer and restorePeer", () => {
  it("removes and restores", () => {
    const removed = removePeer(base, "AAON");
    expect(removed.removed).toEqual(["AAON"]);
    expect(restorePeer(removed, "AAON")).toEqual(base);
  });

  it("removing an added peer drops it from added (no stale entry in the URL)", () => {
    const s = removePeer({ ...base, added: ["TT"] }, "TT");
    expect(s.added).toEqual([]);
    expect(s.removed).toEqual([]);
  });

  it("restoring is refused silently past 12 peers", () => {
    const added = Array.from({ length: 10 }, (_, i) => `X${i}`);
    const s = { ...base, added, removed: ["AAON"] };
    const full = { ...s, added: [...added, "TT"] };
    expect(restorePeer(full, "AAON")).toEqual(full);
  });
});
