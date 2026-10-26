import type { ErrorResponseBody } from "@/lib/errors";

const HEADINGS: Partial<Record<ErrorResponseBody["code"], string>> = {
  INVALID_INPUT: "Check the ticker",
  TICKER_NOT_FOUND: "Unknown ticker",
  UNSUPPORTED_ISSUER: "Company not supported",
  SEC_RATE_LIMITED: "SEC is limiting requests",
  SEC_UNAVAILABLE: "SEC didn't respond",
};

// Blueprint §6 UX states for a company that can't be shown. Only the user-safe
// message from blueprint §15 reaches the page.
export function ErrorState({ error }: { error: ErrorResponseBody }) {
  return (
    <section
      role="alert"
      className="max-w-xl border border-error/40 bg-error-bg px-4 py-3"
    >
      <h1 className="text-base font-semibold text-error">
        {HEADINGS[error.code] ?? "Couldn't load this company"}
      </h1>
      <p className="mt-1 text-sm">{error.message}</p>
      {error.code === "INTERNAL" && (
        <p className="mt-1 text-xs text-muted">Request ID {error.requestId}</p>
      )}
    </section>
  );
}
