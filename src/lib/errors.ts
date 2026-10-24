// Error classes from blueprint §15. Each carries a code, a user-safe message and
// internal detail for logs. Detail never contains the User-Agent or any header.

export type ErrorCode =
  | "TICKER_NOT_FOUND"
  | "UNSUPPORTED_ISSUER"
  | "SEC_UNAVAILABLE"
  | "SEC_RATE_LIMITED"
  | "SEC_SCHEMA_CHANGED"
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

export class InternalError extends PeerSetError {
  readonly code = "INTERNAL";
  readonly retryable = false;
  constructor(detail: string) {
    super("Something went wrong on our side", detail);
  }
}
