// GET /api/peers?ticker=&count= — the peer selection for a target (blueprint §10.2,
// §13), from the committed peer index only: no SEC or price calls. Kept apart from
// route.ts so tests can inject an index and a date.

import {
  errorResponseBody,
  httpStatusFor,
  InvalidInputError,
  PeerSetError,
} from "@/lib/errors";
import { normalizeTicker } from "@/lib/fundamentals";
import { log, type Logger } from "@/lib/log";
import { selectPeers, type PeersDeps } from "@/lib/peers";

export type { PeersDeps };

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
    try {
      const deps = makeDeps();
      const params = new URL(request.url).searchParams;
      const ticker = normalizeTicker(params.get("ticker"));
      const count = parseCount(params.get("count"));
      return Response.json(selectPeers(ticker, deps, count), {
        headers: { "Cache-Control": "no-store" },
      });
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
