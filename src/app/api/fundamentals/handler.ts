// GET /api/fundamentals?ticker= — kept apart from route.ts so tests can inject a
// fixture SEC client and cache (route files may only export Next's own names).

import {
  errorResponseBody,
  httpStatusFor,
  PeerSetError,
  SecRateLimitedError,
} from "@/lib/errors";
import { loadFundamentals, type LoadDeps } from "@/lib/fundamentals";
import { log, type Logger } from "@/lib/log";

export function createFundamentalsHandler(
  makeDeps: () => LoadDeps,
  logger: Logger = log,
) {
  return async function GET(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const deps = makeDeps();
      const ticker = new URL(request.url).searchParams.get("ticker");
      const fundamentals = await loadFundamentals(ticker, deps);
      return Response.json(fundamentals, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (err) {
      // Detail goes to logs only; it never holds the User-Agent or headers.
      logger("fundamentals_error", {
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
