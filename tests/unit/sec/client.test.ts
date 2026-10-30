import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLimiter, createSecClient } from "@/sec/client";
import type { LogFields } from "@/lib/log";
import { PeerSetError } from "@/lib/errors";

// A unique fake User-Agent, so any leak into logs or errors is easy to spot.
const UA = "PeerSet-Test (Test Person) leak-canary@example.invalid";
const ENV = { SEC_USER_AGENT: UA };
const URL_OK = "https://data.sec.gov/submissions/CIK0001069202.json";

type FetchArgs = [string, RequestInit];

function setup(responses: (() => Response | Promise<Response>)[]) {
  const calls: FetchArgs[] = [];
  const callTimes: number[] = [];
  const sleeps: number[] = [];
  const logs: { event: string; fields: LogFields }[] = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    callTimes.push(Date.now());
    const next = responses[Math.min(i++, responses.length - 1)];
    return next();
  });
  const client = createSecClient({
    fetch: fetchMock as unknown as typeof fetch,
    env: ENV,
    logger: (event, fields) => logs.push({ event, fields }),
    limiter: createLimiter(),
    random: () => 0.5,
    sleep: (ms) => {
      sleeps.push(ms);
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
  });
  return { client, calls, callTimes, sleeps, logs, fetchMock };
}

const ok =
  (body = '{"ok":true}') =>
  () =>
    new Response(body, { status: 200 });
const status =
  (code: number, body = "") =>
  () =>
    new Response(body, { status: code });

async function settle<T>(p: Promise<T>): Promise<T> {
  // Advance fake timers until the promise resolves or rejects.
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  for (let k = 0; k < 600 && !done; k++) await vi.advanceTimersByTimeAsync(100);
  return p;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SEC client", () => {
  it("sends the User-Agent and Accept-Encoding headers", async () => {
    const { client, calls } = setup([ok()]);
    const res = await settle(client.get(URL_OK));
    expect(res.kind).toBe("ok");
    const headers = new Headers(calls[0][1].headers);
    expect(headers.get("user-agent")).toBe(UA);
    expect(headers.get("accept-encoding")).toBe("gzip, deflate");
  });

  it("returns the body and parses JSON", async () => {
    const { client } = setup([ok('{"a":1}')]);
    expect(await settle(client.getJson(URL_OK))).toEqual({
      kind: "ok",
      data: { a: 1 },
    });
  });

  it("fails clearly when SEC_USER_AGENT is missing", () => {
    expect(() =>
      createSecClient({ fetch: vi.fn() as unknown as typeof fetch, env: {} }),
    ).toThrow(/SEC_USER_AGENT/);
  });

  it.each([
    "https://www.alphavantage.co/query",
    "https://evil.example.com/x",
    "http://data.sec.gov/submissions/CIK0001069202.json",
    "https://data.sec.gov.evil.com/x",
  ])("rejects a URL outside the allow-list: %s", async (url) => {
    const { client, fetchMock } = setup([ok()]);
    await expect(client.get(url)).rejects.toThrow(/not allowed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts www.sec.gov archive URLs", async () => {
    const { client } = setup([ok()]);
    const res = await settle(
      client.get(
        "https://www.sec.gov/Archives/edgar/data/1069202/x/index.json",
      ),
    );
    expect(res.kind).toBe("ok");
  });

  it("paces requests to at most 2.5 per second (ADR 0009)", async () => {
    const { client, callTimes } = setup([ok()]);
    await settle(
      Promise.all(Array.from({ length: 8 }, () => client.get(URL_OK))),
    );
    expect(callTimes.length).toBe(8);
    for (let k = 1; k < callTimes.length; k++)
      expect(callTimes[k] - callTimes[k - 1]).toBeGreaterThanOrEqual(400);
  });

  it("keeps at most 3 requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = () =>
      new Promise<Response>((resolve) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        setTimeout(() => {
          inFlight--;
          resolve(new Response("{}", { status: 200 }));
        }, 2000);
      });
    const { client } = setup([slow]);
    await settle(
      Promise.all(Array.from({ length: 6 }, () => client.get(URL_OK))),
    );
    expect(peak).toBe(3);
  });

  it("retries a 503, then succeeds", async () => {
    const { client, calls, logs } = setup([status(503), ok()]);
    const res = await settle(client.get(URL_OK));
    expect(res.kind).toBe("ok");
    expect(calls.length).toBe(2);
    expect(logs.at(-1)?.fields.retries).toBe(1);
  });

  it("gives up after 2 retries on repeated 5xx", async () => {
    const { client, calls } = setup([status(502)]);
    const p = client.get(URL_OK);
    await expect(settle(p)).rejects.toMatchObject({ code: "SEC_UNAVAILABLE" });
    expect(calls.length).toBe(3);
  });

  it("backs off about 0.5 s, then 1.5 s, between retries", async () => {
    // random() = 0.5 makes the jitter factor exactly 1.
    const { client, sleeps } = setup([status(500)]);
    await settle(client.get(URL_OK).catch(() => undefined));
    const backoffs = sleeps.filter((ms) => ms >= 400);
    expect(backoffs).toEqual([500, 1500]);
  });

  it("never retries a 404 and returns not-found", async () => {
    const { client, calls } = setup([status(404)]);
    const res = await settle(client.get(URL_OK));
    expect(res).toEqual({ kind: "not-found", url: URL_OK });
    expect(calls.length).toBe(1);
  });

  it("classifies a rate-threshold 403 as SEC_RATE_LIMITED, without retry", async () => {
    const page =
      "<html><head><title>SEC.gov | Request Rate Threshold Exceeded</title></head></html>";
    const { client, calls } = setup([status(403, page)]);
    await expect(settle(client.get(URL_OK))).rejects.toMatchObject({
      code: "SEC_RATE_LIMITED",
    });
    expect(calls.length).toBe(1);
  });

  it("classifies an undeclared-tool 403 as SEC_UNAVAILABLE (User-Agent rejected)", async () => {
    const page =
      "<html><head><title>SEC.gov | Your Request Originates from an Undeclared Automated Tool</title></head></html>";
    const { client, calls } = setup([status(403, page)]);
    await expect(settle(client.get(URL_OK))).rejects.toMatchObject({
      code: "SEC_UNAVAILABLE",
      detail: expect.stringContaining("User-Agent rejected"),
    });
    expect(calls.length).toBe(1);
  });

  it("classifies any other 403 as SEC_UNAVAILABLE", async () => {
    const { client } = setup([status(403, "forbidden")]);
    await expect(settle(client.get(URL_OK))).rejects.toMatchObject({
      code: "SEC_UNAVAILABLE",
    });
  });

  it("times out after 10 s and retries, then fails as SEC_UNAVAILABLE", async () => {
    const hangUntilAbort = (url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    const logs: { event: string; fields: LogFields }[] = [];
    const fetchMock = vi.fn(hangUntilAbort);
    const client = createSecClient({
      fetch: fetchMock as unknown as typeof fetch,
      env: ENV,
      logger: (event, fields) => logs.push({ event, fields }),
      limiter: createLimiter(),
      random: () => 0.5,
    });
    const p = client.get(URL_OK);
    const outcome = settle(p).catch((e: unknown) => e);
    const err = (await outcome) as PeerSetError;
    expect(err.code).toBe("SEC_UNAVAILABLE");
    expect(err.detail).toMatch(/timeout/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("enforces the 15 MB cap from Content-Length", async () => {
    const big = () =>
      new Response("x", {
        status: 200,
        headers: { "content-length": String(16 * 1024 * 1024) },
      });
    const { client } = setup([big]);
    await expect(settle(client.get(URL_OK))).rejects.toMatchObject({
      code: "SEC_UNAVAILABLE",
      detail: expect.stringMatching(/15 MB/),
    });
  });

  it("enforces the 15 MB cap while streaming a body without Content-Length", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const stream = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (let k = 0; k < 16; k++) controller.enqueue(chunk);
            controller.close();
          },
        }),
        { status: 200 },
      );
    const { client } = setup([stream]);
    await expect(settle(client.get(URL_OK))).rejects.toMatchObject({
      detail: expect.stringMatching(/15 MB/),
    });
  });

  it("logs one line per request with host, path, status, ms, bytes, retries", async () => {
    const { client, logs } = setup([ok('{"a":1}')]);
    await settle(client.get(URL_OK));
    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe("sec_request");
    expect(logs[0].fields).toMatchObject({
      host: "data.sec.gov",
      path: "/submissions/CIK0001069202.json",
      status: 200,
      bytes: 7,
      retries: 0,
    });
    expect(typeof logs[0].fields.ms).toBe("number");
  });

  it("never puts the User-Agent into logs or errors", async () => {
    const failures = [
      status(403, "Request Rate Threshold Exceeded"),
      status(403, "Undeclared Automated Tool"),
      status(403, "other"),
      status(503),
      status(404),
      ok(),
    ];
    for (const f of failures) {
      const { client, logs } = setup([f]);
      const err = await settle(client.get(URL_OK)).catch((e: unknown) => e);
      const dump = JSON.stringify(logs) + JSON.stringify(err) + String(err);
      expect(dump).not.toContain(UA);
      expect(dump).not.toContain("leak-canary");
      if (err instanceof PeerSetError) {
        expect(err.detail).not.toContain("leak-canary");
        expect(err.message).not.toContain("leak-canary");
      }
    }
  });
});

describe("fetch cache opt-in (blueprint §14)", () => {
  it("caches a request only when a lifetime is given", async () => {
    const { client, calls } = setup([ok(), ok()]);
    await settle(client.getJson(URL_OK, { revalidate: 21_600 }));
    await settle(client.getJson(URL_OK));
    expect(calls[0][1]).toMatchObject({
      cache: "force-cache",
      next: { revalidate: 21_600 },
    });
    expect(calls[1][1]).not.toHaveProperty("cache");
    expect(calls[1][1]).not.toHaveProperty("next");
  });
});
