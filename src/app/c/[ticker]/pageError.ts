// How /c/[ticker] answers a failure (M4a): an unknown ticker or an unsupported company
// is a 404 through Next's notFound() (a page can't send 422; the API does), and every
// other failure stays on the page as an error state. notFound() can't pass a message
// and not-found.tsx gets no props, so the 404 page asks the API for the reason
// (CompanyNotFoundReason).

import {
  errorResponseBody,
  PeerSetError,
  type ErrorResponseBody,
} from "@/lib/errors";

export function pageErrorOutcome(
  err: unknown,
  requestId: string,
): { notFound: boolean; body: ErrorResponseBody } {
  const code = err instanceof PeerSetError ? err.code : "INTERNAL";
  return {
    notFound: code === "TICKER_NOT_FOUND" || code === "UNSUPPORTED_ISSUER",
    body: errorResponseBody(err, requestId),
  };
}
