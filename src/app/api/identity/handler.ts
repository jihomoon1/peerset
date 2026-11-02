// GET /api/identity?ticker= (M6): the company's identity and support status, from the
// ticker list and submissions only, for the home search's identity card (blueprint §6
// "Valid, not analyzed"). Kept apart from route.ts so tests can inject a fixture client.

import {
  errorResponseBody,
  httpStatusFor,
  PeerSetError,
  SecRateLimitedError,
} from "@/lib/errors";
import { loadIdentity, type LoadDeps } from "@/lib/fundamentals";
import { log, type Logger } from "@/lib/log";

export function createIdentityHandler(
  makeDeps: () => LoadDeps,
  logger: Logger = log,
) {
  return async function GET(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const ticker = new URL(request.url).searchParams.get("ticker");
      const { identity } = await loadIdentity(ticker, makeDeps());
      return Response.json(identity, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (err) {
      logger("identity_error", {
        requestId,
        code: err instanceof PeerSetError ? err.code : "INTERNAL",
        detail:
          err instanceof PeerSetError
            ? err.detail
            : `${err instanceof Error ? err.name : typeof err}`,
      });
      return Response.json(errorResponseBody(err, requestId), {
        status: httpStatusFor(err),
        headers: {
          "Cache-Control": "no-store",
          ...(err instanceof SecRateLimitedError
            ? { "Retry-After": "600" }
            : {}),
        },
      });
    }
  };
}
