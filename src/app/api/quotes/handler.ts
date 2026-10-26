// GET /api/quotes?symbols=LII,WSO-B — kept apart from route.ts so tests can inject a
// provider and cache. Exists only in PRICE_PROVIDER=alpha_vantage mode (404
// otherwise). One symbol's failure is reported beside the others' quotes.

import {
  errorResponseBody,
  httpStatusFor,
  InvalidInputError,
  PeerSetError,
} from "@/lib/errors";
import { log, type Logger } from "@/lib/log";
import { loadQuotes, parseSymbols, type QuoteDeps } from "@/lib/quotes";

const NO_STORE = { "Cache-Control": "no-store" };

export function createQuotesHandler(
  makeDeps: () => QuoteDeps,
  logger: Logger = log,
) {
  return async function GET(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const deps = makeDeps();
      if (deps.mode !== "alpha_vantage" || !deps.provider)
        return Response.json(
          { message: "Quotes are off: prices are entered by hand", requestId },
          { status: 404, headers: NO_STORE },
        );
      const symbols = parseSymbols(
        new URL(request.url).searchParams.get("symbols"),
      );
      const result = await loadQuotes(symbols, deps);
      // Every symbol failed: answer with the first failure's status.
      const status =
        result.quotes.length === 0 && result.errors.length > 0
          ? result.errors[0].code === "PRICE_RATE_LIMITED"
            ? 429
            : 502
          : 200;
      return Response.json(
        { ...result, requestId },
        { status, headers: NO_STORE },
      );
    } catch (err) {
      logger("quotes_error", {
        requestId,
        code: err instanceof PeerSetError ? err.code : "INTERNAL",
        detail:
          err instanceof PeerSetError
            ? err.detail
            : `${err instanceof Error ? err.name : typeof err}`,
      });
      return Response.json(errorResponseBody(err, requestId), {
        status: err instanceof InvalidInputError ? 400 : httpStatusFor(err),
        headers: NO_STORE,
      });
    }
  };
}
