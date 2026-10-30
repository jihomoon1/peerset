// The only code that talks to SEC. Enforces blueprint §8.2 fair access: identify with
// a User-Agent, at most 2.5 requests per second and 3 in flight per instance, bounded
// retries, timeouts and response sizes. Server-side only.

import {
  InternalError,
  SecRateLimitedError,
  SecUnavailableError,
} from "@/lib/errors";
import { log as defaultLog, type Logger } from "@/lib/log";

const ALLOWED_HOSTS = new Set(["www.sec.gov", "data.sec.gov"]);
// 2.5 requests per second: the browser loads up to 3 peers at once, each possibly on
// its own instance, so the worst case is 3 × 2.5 = 7.5 per second (ADR 0009).
const MIN_GAP_MS = 400;
const MAX_IN_FLIGHT = 3;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 15 * 1024 * 1024;
const BACKOFF_MS = [500, 1500]; // one entry per retry, so at most 2 retries

export type SecResponse =
  | { kind: "ok"; url: string; body: Uint8Array }
  | { kind: "not-found"; url: string };

export type SecJsonResponse =
  { kind: "ok"; data: unknown } | { kind: "not-found"; url: string };

// Opt a request into Next's fetch Data Cache for `revalidate` seconds (blueprint §14).
// Only small responses: Vercel refuses cache items over 2 MB, so companyfacts never.
export interface FetchCacheOptions {
  revalidate?: number;
}

export interface SecClient {
  get(url: string, cache?: FetchCacheOptions): Promise<SecResponse>;
  getJson(url: string, cache?: FetchCacheOptions): Promise<SecJsonResponse>;
}

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ── Limiter ─────────────────────────────────────────────────────────────────

export interface Limiter {
  acquire(sleep: Sleep): Promise<void>;
  release(): void;
}

export function createLimiter(
  minGapMs = MIN_GAP_MS,
  maxInFlight = MAX_IN_FLIGHT,
): Limiter {
  let nextSlot = 0;
  let inFlight = 0;
  const waiters: (() => void)[] = [];
  return {
    async acquire(sleep) {
      while (inFlight >= maxInFlight)
        await new Promise<void>((resolve) => waiters.push(resolve));
      inFlight++;
      // Reserve the next start slot before waiting, so concurrent callers queue up.
      const now = Date.now();
      const start = Math.max(now, nextSlot);
      nextSlot = start + minGapMs;
      if (start > now) await sleep(start - now);
    },
    release() {
      inFlight--;
      waiters.shift()?.();
    },
  };
}

// One limiter per server instance, shared by every client (blueprint §8.2).
const sharedLimiter = createLimiter();

// ── Client ──────────────────────────────────────────────────────────────────

export interface SecClientOptions {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  logger?: Logger;
  limiter?: Limiter;
  sleep?: Sleep;
  random?: () => number;
}

class TooLargeError extends Error {}

type Attempt =
  { kind: "response"; status: number; body: Uint8Array } | { kind: "timeout" };

export function createSecClient(options: SecClientOptions = {}): SecClient {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const env = options.env ?? process.env;
  const logger = options.logger ?? defaultLog;
  const limiter = options.limiter ?? sharedLimiter;
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;

  const userAgent = env.SEC_USER_AGENT;
  if (!userAgent)
    throw new InternalError(
      "SEC_USER_AGENT is not set; add it to .env.local or the deployment settings",
    );

  async function attempt(
    url: string,
    cache: FetchCacheOptions,
  ): Promise<Attempt> {
    await limiter.acquire(sleep);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn(url, {
        headers: {
          "User-Agent": userAgent!,
          "Accept-Encoding": "gzip, deflate",
        },
        signal: controller.signal,
        ...(cache.revalidate !== undefined
          ? {
              cache: "force-cache" as const,
              next: { revalidate: cache.revalidate },
            }
          : {}),
      });
      const body = await readCapped(res);
      return { kind: "response", status: res.status, body };
    } catch (err) {
      if (controller.signal.aborted) return { kind: "timeout" };
      throw err;
    } finally {
      clearTimeout(timer);
      limiter.release();
    }
  }

  async function get(
    url: string,
    cache: FetchCacheOptions = {},
  ): Promise<SecResponse> {
    const { host, pathname } = checkUrl(url);
    const started = Date.now();
    let retries = 0;
    const done = (status: number | string, bytes: number) =>
      logger("sec_request", {
        host,
        path: pathname,
        status,
        ms: Date.now() - started,
        bytes,
        retries,
      });

    for (;;) {
      let result: Attempt;
      try {
        result = await attempt(url, cache);
      } catch (err) {
        if (err instanceof TooLargeError) {
          done("too-large", 0);
          throw new SecUnavailableError(
            `response over 15 MB cap: ${host}${pathname}`,
          );
        }
        done("network-error", 0);
        throw new SecUnavailableError(
          `network error: ${host}${pathname}: ${err instanceof Error ? err.name : "unknown"}`,
        );
      }

      const transient =
        result.kind === "timeout" ||
        (result.status >= 500 && result.status <= 599);
      if (transient && retries < BACKOFF_MS.length) {
        // Jitter of ±25% around the planned wait.
        await sleep(Math.round(BACKOFF_MS[retries] * (0.75 + random() * 0.5)));
        retries++;
        continue;
      }

      if (result.kind === "timeout") {
        done("timeout", 0);
        throw new SecUnavailableError(
          `timeout after ${TIMEOUT_MS} ms (${retries} retries): ${host}${pathname}`,
        );
      }

      const { status, body } = result;
      done(status, body.byteLength);
      if (status === 200) return { kind: "ok", url, body };
      if (status === 404) return { kind: "not-found", url };
      if (status === 403) throw classify403(body, host, pathname);
      if (status === 429)
        throw new SecRateLimitedError(`HTTP 429: ${host}${pathname}`);
      throw new SecUnavailableError(
        `HTTP ${status} (${retries} retries): ${host}${pathname}`,
      );
    }
  }

  async function getJson(
    url: string,
    cache: FetchCacheOptions = {},
  ): Promise<SecJsonResponse> {
    const res = await get(url, cache);
    if (res.kind === "not-found") return res;
    try {
      return {
        kind: "ok",
        data: JSON.parse(new TextDecoder().decode(res.body)),
      };
    } catch {
      throw new SecUnavailableError(`response was not valid JSON: ${url}`);
    }
  }

  return { get, getJson };
}

function checkUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InternalError(`not allowed: malformed URL`);
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname))
    throw new InternalError(
      `not allowed: ${parsed.protocol}//${parsed.hostname}`,
    );
  return parsed;
}

function classify403(body: Uint8Array, host: string, path: string) {
  const text = new TextDecoder().decode(body.subarray(0, 64 * 1024));
  if (/Request Rate Threshold Exceeded/i.test(text))
    return new SecRateLimitedError(
      `403 Request Rate Threshold Exceeded: ${host}${path}`,
    );
  if (/Undeclared Automated Tool/i.test(text))
    return new SecUnavailableError(`403 User-Agent rejected: ${host}${path}`);
  return new SecUnavailableError(`HTTP 403: ${host}${path}`);
}

// Reads the body, refusing anything over the cap without buffering all of it.
async function readCapped(res: Response): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await res.body?.cancel();
    throw new TooLargeError();
  }
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new TooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
