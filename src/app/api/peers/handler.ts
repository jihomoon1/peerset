// GET /api/peers?ticker=&count= — the peer selection for a target (blueprint §10.2,
// §13), from the committed peer index only: no SEC or price calls. Kept apart from
// route.ts so tests can inject an index and a date.

import {
  errorResponseBody,
  httpStatusFor,
  InvalidInputError,
  PeerIndexUnavailableError,
  PeerSetError,
} from "@/lib/errors";
import { normalizeTicker } from "@/lib/fundamentals";
import { log, type Logger } from "@/lib/log";
import type { PeerIndex } from "@/peers/indexTypes";
import { findTarget, screenPeers } from "@/peers/screen";

export interface PeersDeps {
  index: () => PeerIndex;
  analysisDate: string; // today, ISO; screening never reads the clock
  logger: Logger;
}

function parseCount(raw: string | null): number | undefined {
  if (raw === null || raw === "") return undefined;
  if (!/^\d{1,2}$/.test(raw))
    throw new InvalidInputError(
      "Peer count must be a whole number from 5 to 12",
    );
  return Number(raw);
}

export function createPeersHandler(
  makeDeps: () => PeersDeps,
  logger: Logger = log,
) {
  return async function GET(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    try {
      const deps = makeDeps();
      const params = new URL(request.url).searchParams;
      const ticker = normalizeTicker(params.get("ticker"));
      const count = parseCount(params.get("count"));
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
      return Response.json(
        {
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
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (err) {
      logger("peers_error", {
        requestId,
        code: err instanceof PeerSetError ? err.code : "INTERNAL",
        detail:
          err instanceof PeerSetError
            ? err.detail
            : `${err instanceof Error ? err.name : typeof err}`,
      });
      return Response.json(errorResponseBody(err, requestId), {
        status: httpStatusFor(err),
        headers: { "Cache-Control": "no-store" },
      });
    }
  };
}
