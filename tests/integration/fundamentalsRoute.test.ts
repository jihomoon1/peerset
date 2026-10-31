import { describe, expect, it } from "vitest";
import { createFundamentalsHandler } from "@/app/api/fundamentals/handler";
import type { CacheFn } from "@/lib/cache";
import {
  FUNDAMENTALS_CACHE_VERSION,
  tickerTableMemo,
  type LoadDeps,
} from "@/lib/fundamentals";
import { createLimiter, createSecClient } from "@/sec/client";
import { fixtureFetch } from "../helpers/fixtures";

// The route handler on frozen fixtures (blueprint §13, §15). A unique fake User-Agent
// makes any leak into a response easy to spot.
const UA = "PeerSet-Test leak-canary@example.invalid";

function deps(
  over: Partial<LoadDeps> & { fetch?: typeof fetch; fixture?: string } = {},
): {
  deps: LoadDeps;
  requested: string[];
  logs: string[];
} {
  const { fixture = "LII/2026Q2", ...rest } = over;
  const fake = fixtureFetch(["_shared", fixture]);
  const logs: string[] = [];
  const client = createSecClient({
    fetch: rest.fetch ?? fake.fetch,
    env: { SEC_USER_AGENT: UA },
    logger: () => {},
    limiter: createLimiter(0),
  });
  return {
    deps: {
      client,
      cache: (_key, _revalidate, fn) => fn(),
      asOf: "2026-10-23",
      logger: (event, fields) =>
        logs.push(JSON.stringify({ event, ...fields })),
      ...rest,
    },
    requested: fake.requested,
    logs,
  };
}

const quiet = () => {};

const get = (handler: (r: Request) => Promise<Response>, query: string) =>
  handler(new Request(`http://localhost/api/fundamentals${query}`));

describe("GET /api/fundamentals", () => {
  it("returns LII's fundamentals", async () => {
    const { deps: d } = deps();
    const res = await get(
      createFundamentalsHandler(() => d, quiet),
      "?ticker=lii",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity).toMatchObject({ ticker: "LII", cik: "0001069202" });
    expect(body.metrics.revenue).toMatchObject({
      status: "derived",
      value: 5_302_200_000,
    });
    expect(body.freshness.status).toBe("filing-parsed");
  });

  it.each([
    ["LII", "LII/2026Q2", 1_581_300_000, 52_100_000],
    ["WSO", "WSO/2026Q2", 9_068_000, 464_189_000],
  ])(
    "returns %s's debt, cash and EV adjustments; cache entry under 2 MB",
    async (ticker, fixture, debt, cash) => {
      const { deps: d, logs } = deps({
        fixture,
        asOf: "2026-10-26",
        now: () => new Date("2026-10-26T15:30:00.000Z"),
      });
      const res = await get(
        createFundamentalsHandler(() => d, quiet),
        `?ticker=${ticker}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.debt.metric).toMatchObject({
        status: "derived",
        value: debt,
      });
      expect(body.cash.metric).toMatchObject({
        status: "derived",
        value: cash,
      });
      expect(Object.keys(body.evAdjustments).sort()).toEqual([
        "nci",
        "preferred",
      ]);
      expect(body.balanceSheet.statement.url).toMatch(/\/R\d+\.htm$/);
      expect(body.pulledAt).toBe("2026-10-26T15:30:00.000Z");
      expect(
        body.shareClasses.classes.map((c: { ticker: string }) => c.ticker),
      ).toEqual(ticker === "WSO" ? ["WSO-B", "WSO"] : [ticker]);
      const line = JSON.parse(logs.find((l) => l.includes('"fundamentals"'))!);
      expect(line.bytes).toBeLessThan(2 * 1024 * 1024);
    },
  );

  it("caches fundamentals by CIK + latest accession + methodology version, under 2 MB", async () => {
    const calls: { key: string[]; revalidate: number }[] = [];
    let stored: unknown;
    const cache: CacheFn = async (key, revalidate, fn) => {
      calls.push({ key, revalidate });
      stored ??= await fn();
      return stored as never;
    };
    const { deps: d, requested, logs } = deps({ cache });
    const handler = createFundamentalsHandler(() => d, quiet);
    await get(handler, "?ticker=LII");
    const companyFactsCalls = () =>
      requested.filter((u) => u.includes("companyfacts")).length;
    expect(companyFactsCalls()).toBe(1);
    await get(handler, "?ticker=LII");
    expect(companyFactsCalls()).toBe(1); // second request served from the cache

    expect(calls[0]).toEqual({
      key: [
        "fundamentals",
        "0001069202",
        "0001069202-26-000087",
        "0.3.5",
        `cache-v${FUNDAMENTALS_CACHE_VERSION}`,
      ],
      revalidate: 86_400,
    });
    const line = JSON.parse(logs.find((l) => l.includes('"fundamentals"'))!);
    expect(line.bytes).toBeGreaterThan(0);
    expect(line.bytes).toBeLessThan(2 * 1024 * 1024);
  });

  it.each([
    ["", "INVALID_INPUT", 400],
    ["?ticker=", "INVALID_INPUT", 400],
    ["?ticker=LII%3B%20DROP", "INVALID_INPUT", 400],
    ["?ticker=ZZZZZZ", "TICKER_NOT_FOUND", 404],
  ])("%s → %s", async (query, code, status) => {
    const { deps: d } = deps();
    const res = await get(
      createFundamentalsHandler(() => d, quiet),
      query,
    );
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code });
  });

  it("unknown ticker says so in plain words", async () => {
    const { deps: d } = deps();
    const res = await get(
      createFundamentalsHandler(() => d, quiet),
      "?ticker=ZZZZZZ",
    );
    expect((await res.json()).message).toBe(
      "No SEC-registered company uses ZZZZZZ",
    );
  });

  it("an unsupported issuer gets 422 with the reason", async () => {
    // A year later LII's Q2 10-Q is over 200 days old: a stale filer.
    const { deps: d } = deps({ asOf: "2027-06-01" });
    const res = await get(
      createFundamentalsHandler(() => d, quiet),
      "?ticker=LII",
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("UNSUPPORTED_ISSUER");
    expect(body.message).toContain("more than 200 days ago");
  });

  it("SEC rate limiting → 429 with Retry-After, and nothing leaks", async () => {
    const limited = (async () =>
      new Response(
        "<html>Request Rate Threshold Exceeded. Your Request Originates from an Undeclared Automated Tool</html>",
        { status: 403 },
      )) as unknown as typeof fetch;
    const { deps: d } = deps({ fetch: limited });
    const res = await get(
      createFundamentalsHandler(() => d, quiet),
      "?ticker=LII",
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("600");
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({
      code: "SEC_RATE_LIMITED",
      message: "SEC is limiting requests; try again in about 10 minutes",
    });
    expect(text).not.toContain("leak-canary");
    expect(text).not.toMatch(/\bat .*\.ts:\d+/); // no stack trace
  });

  it("a missing User-Agent setting is INTERNAL, without details", async () => {
    const res = await get(
      createFundamentalsHandler(() => {
        throw new Error("SEC_USER_AGENT is not set");
      }, quiet),
      "?ticker=LII",
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("SEC_USER_AGENT");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("ticker-list memo (ADR 0009)", () => {
  const TICKERS = "https://www.sec.gov/files/company_tickers_exchange.json";

  it("a second load within the TTL doesn't request the ticker list again", async () => {
    const clock = 0;
    const memo = tickerTableMemo(24 * 3600 * 1000, () => clock);
    const { deps: d, requested } = deps({ tickerTable: memo });
    const handler = createFundamentalsHandler(() => d, quiet);
    const submissions = () =>
      requested.filter((u) => u.includes("/submissions/")).length;
    expect((await get(handler, "?ticker=LII")).status).toBe(200);
    const afterFirst = submissions();
    expect((await get(handler, "?ticker=LII")).status).toBe(200);
    expect(requested.filter((u) => u === TICKERS)).toHaveLength(1);
    // Submissions is still checked every time: it is how a new filing is found.
    expect(submissions()).toBeGreaterThan(afterFirst);
  });

  it("re-reads the ticker list once the TTL has passed", async () => {
    let clock = 0;
    const memo = tickerTableMemo(1000, () => clock);
    const { deps: d, requested } = deps({ tickerTable: memo });
    const handler = createFundamentalsHandler(() => d, quiet);
    await get(handler, "?ticker=LII");
    clock = 1001;
    await get(handler, "?ticker=LII");
    expect(requested.filter((u) => u === TICKERS)).toHaveLength(2);
  });
});
