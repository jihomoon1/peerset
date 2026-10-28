// Error classes from blueprint §15. Each carries a code, a user-safe message and
// internal detail for logs. Detail never contains the User-Agent or any header.

export type ErrorCode =
  | "INVALID_INPUT"
  | "TICKER_NOT_FOUND"
  | "UNSUPPORTED_ISSUER"
  | "SEC_UNAVAILABLE"
  | "SEC_RATE_LIMITED"
  | "SEC_SCHEMA_CHANGED"
  | "PRICE_UNAVAILABLE"
  | "PRICE_RATE_LIMITED"
  | "PEER_INDEX_UNAVAILABLE"
  | "INTERNAL";

export abstract class PeerSetError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly retryable: boolean;
  readonly userMessage: string;
  readonly detail: string;

  constructor(userMessage: string, detail: string) {
    super(`${userMessage} (${detail})`);
    this.name = new.target.name;
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

export class InvalidInputError extends PeerSetError {
  readonly code = "INVALID_INPUT";
  readonly retryable = false;
  constructor(userMessage: string, detail = userMessage) {
    super(userMessage, detail);
  }
}

export class TickerNotFoundError extends PeerSetError {
  readonly code = "TICKER_NOT_FOUND";
  readonly retryable = false;
  constructor(ticker: string, detail = "not in SEC ticker list") {
    super(`No SEC-registered company uses ${ticker}`, detail);
  }
}

export class UnsupportedIssuerError extends PeerSetError {
  readonly code = "UNSUPPORTED_ISSUER";
  readonly retryable = false;
  constructor(reason: string, detail = reason) {
    super(reason, detail);
  }
}

export class SecUnavailableError extends PeerSetError {
  readonly code = "SEC_UNAVAILABLE";
  readonly retryable = true;
  constructor(detail: string) {
    super("SEC didn't respond; try again later", detail);
  }
}

export class SecRateLimitedError extends PeerSetError {
  readonly code = "SEC_RATE_LIMITED";
  readonly retryable = true;
  constructor(detail: string) {
    super("SEC is limiting requests; try again in about 10 minutes", detail);
  }
}

export class SecSchemaChangedError extends PeerSetError {
  readonly code = "SEC_SCHEMA_CHANGED";
  readonly retryable = false;
  constructor(detail: string) {
    super(
      "SEC data format changed; this company can't be analyzed right now",
      detail,
    );
  }
}

// The price provider failed or returned no usable price (blueprint §15): the page
// shows the price input instead. Detail never holds the API key or the request URL.
export class PriceUnavailableError extends PeerSetError {
  readonly code = "PRICE_UNAVAILABLE";
  readonly retryable = true;
  constructor(detail: string) {
    super("The price provider didn't return a price; enter it by hand", detail);
  }
}

export class PriceRateLimitedError extends PeerSetError {
  readonly code = "PRICE_RATE_LIMITED";
  readonly retryable = true;
  constructor(detail: string) {
    super(
      "The price provider's daily limit is reached; enter the price by hand or try tomorrow",
      detail,
    );
  }
}

// The committed peer index is missing, empty or unreadable (M4a): peers can't be
// screened until the monthly refresh PR is merged.
export class PeerIndexUnavailableError extends PeerSetError {
  readonly code = "PEER_INDEX_UNAVAILABLE";
  readonly retryable = true;
  constructor(detail: string) {
    super("The peer list isn't available yet; try again later", detail);
  }
}

export class InternalError extends PeerSetError {
  readonly code = "INTERNAL";
  readonly retryable = false;
  constructor(detail: string) {
    super("Something went wrong on our side", detail);
  }
}

// ── HTTP mapping ────────────────────────────────────────────────────────────

const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  TICKER_NOT_FOUND: 404,
  UNSUPPORTED_ISSUER: 422,
  SEC_RATE_LIMITED: 429,
  SEC_SCHEMA_CHANGED: 502,
  SEC_UNAVAILABLE: 503,
  PRICE_UNAVAILABLE: 502,
  PRICE_RATE_LIMITED: 429,
  PEER_INDEX_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export function httpStatusFor(err: unknown): number {
  return err instanceof PeerSetError ? HTTP_STATUS[err.code] : 500;
}

export interface ErrorResponseBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
}

// What the browser sees: never the detail, a stack trace or a raw provider error.
export function errorResponseBody(
  err: unknown,
  requestId: string,
): ErrorResponseBody {
  const e =
    err instanceof PeerSetError ? err : new InternalError("unclassified error");
  return {
    code: e.code,
    message: e.userMessage,
    retryable: e.retryable,
    requestId,
  };
}
