// Peer selection for one target (blueprint §10.2, §13), shared by GET /api/peers and
// the /c/[ticker] page so the first paint already lists the SIC matches. Reads only the
// committed peer index: no SEC or price calls.

import type { PeerSelectionResult } from "@/domain/types";
import type { PeerIndex } from "@/peers/indexTypes";
import { loadPeerIndex } from "@/peers/loadIndex";
import { findTarget, screenPeers } from "@/peers/screen";
import { PeerIndexUnavailableError } from "./errors";
import { FIXTURE_AS_OF, fixtureModeOn } from "./fixtureMode";
import { log, type Logger } from "./log";

export interface PeersDeps {
  index: () => PeerIndex;
  analysisDate: string; // today, ISO; screening never reads the clock
  logger: Logger;
}

export type PeersResponse = {
  target: {
    cik: string;
    ticker: string;
    name: string;
    sic: string;
    sicDescription: string;
    screeningRevenue: number;
    screeningRevenuePeriodEnd: string;
  };
  analysisDate: string;
} & PeerSelectionResult;

export function defaultPeersDeps(): PeersDeps {
  return {
    index: () => loadPeerIndex(),
    // Fixture mode pins the analysis date, so screening never drifts with the clock.
    analysisDate: fixtureModeOn()
      ? FIXTURE_AS_OF
      : new Date().toISOString().slice(0, 10),
    logger: log,
  };
}

// `ticker` is already normalized. Throws PeerSetErrors (404, 422, 503) like the route.
export function selectPeers(
  ticker: string,
  deps: PeersDeps,
  count?: number,
): PeersResponse {
  const started = Date.now();
  const index = deps.index();
  if (index.companies.length === 0)
    throw new PeerIndexUnavailableError("peer index has no companies yet");
  const target = findTarget(index, ticker, deps.analysisDate);
  const result = screenPeers(index, target, {
    analysisDate: deps.analysisDate,
    count,
  });
  deps.logger("peers", {
    ticker,
    cik: target.cik,
    tier: result.tier,
    selected: result.selected.length,
    excluded: result.excluded.length,
    ms: Date.now() - started,
  });
  return {
    target: {
      cik: target.cik,
      ticker: target.ticker,
      name: target.name,
      sic: target.sic,
      sicDescription: target.sicDescription,
      // Screening revenue (latest FY), never LTM (blueprint §10.1 step 4).
      screeningRevenue: target.revenue!.value,
      screeningRevenuePeriodEnd: target.revenue!.periodEnd,
    },
    analysisDate: deps.analysisDate,
    ...result,
  };
}
