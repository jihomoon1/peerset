// Reads the committed data/peer-index.json once per server instance (blueprint §14:
// static JSON, changes only when the monthly PR merges and redeploys). Read from disk
// rather than imported, so TypeScript never type-checks a megabyte of JSON; next.config
// ships the file with /api/peers. The path is spelled out statically so Next traces
// only this file.

import { readFileSync } from "node:fs";
import path from "node:path";
import { PeerIndexUnavailableError } from "@/lib/errors";
import { decodeIndex } from "./indexFormat";
import type { PeerIndex } from "./indexTypes";

let loaded: PeerIndex | null = null;

export function loadPeerIndex(): PeerIndex {
  loaded ??= indexFromText(() =>
    readFileSync(path.join(process.cwd(), "data", "peer-index.json"), "utf8"),
  );
  return loaded;
}

// The index from the file's text; anything unreadable is PEER_INDEX_UNAVAILABLE.
export function indexFromText(read: () => string): PeerIndex {
  try {
    return decodeIndex(JSON.parse(read()));
  } catch (err) {
    throw new PeerIndexUnavailableError(
      `peer index unreadable: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}`,
    );
  }
}
