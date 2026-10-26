import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createQuotesHandler } from "@/app/api/quotes/handler";
import { createAlphaVantageProvider } from "@/prices/alphaVantage";
import type { QuoteDeps } from "@/lib/quotes";

// GET /api/quotes?symbols= (blueprint §13, §14): only in alpha_vantage mode, cached
// until the next close, on recorded responses. A canary key makes leaks easy to spot.

const KEY = "LEAKCANARYKEY0001";
const DIR = path.join(
  import.meta.dirname,
  "..",
  "fixtures",
  "prices",
  "alphavantage",
);
const recorded = (file: string) => readFileSync(path.join(DIR, file), "utf8");

function deps(
  bySymbol: Record<string, string>,
  over: Partial<QuoteDeps> = {},
): { deps: QuoteDeps; calls: string[]; keys: string[][]; logs: string[] } {
  const calls: string[] = [];
  const keys: string[][] = [];
  const logs: string[] = [];
  const provider = createAlphaVantageProvider({
    apiKey: KEY,
    fetch: (async (input: string | URL | Request) => {
      const symbol = new URL(String(input)).searchParams.get("symbol")!;
      calls.push(symbol);
      const file = bySymbol[symbol];
      return file
        ? new Response(recorded(file))
        : new Response("{}", { status: 500 });
    }) as typeof fetch,
    now: () => new Date("2026-10-26T14:00:00Z"),
    sleep: async () => {},
  });
  return {
    deps: {
      mode: "alpha_vantage",
      provider,
      cache: (key, _revalidate, fn) => {
        keys.push(key);
        return fn();
      },
      now: new Date("2026-10-26T14:00:00Z"),
      logger: (event, fields) =>
        logs.push(JSON.stringify({ event, ...fields })),
      ...over,
    },
    calls,
    keys,
    logs,
  };
}

const get = (h: (r: Request) => Promise<Response>, q: string) =>
  h(new Request(`http://localhost/api/quotes${q}`));

describe("GET /api/quotes", () => {
  it("is 404 in user mode, without calling the provider", async () => {
    const d = deps({ LII: "LII.json" }, { mode: "user", provider: null });
    const res = await get(
      createQuotesHandler(() => d.deps),
      "?symbols=LII",
    );
    expect(res.status).toBe(404);
    expect(d.calls).toEqual([]);
  });

  it("returns recorded quotes, cached per symbol until the next close", async () => {
    const d = deps({ LII: "LII.json", WSO: "WSO.json" });
    const res = await get(
      createQuotesHandler(() => d.deps),
      "?symbols=LII,wso",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quotes).toEqual([
      expect.objectContaining({
        symbol: "LII",
        close: 376.01,
        asOfDate: "2026-10-23",
        source: "alpha_vantage",
      }),
      expect.objectContaining({ symbol: "WSO", close: 322.98 }),
    ]);
    expect(body.errors).toEqual([]);
    expect(d.keys).toEqual([
      ["quote", "LII", "2026-10-26", "0.3.1"],
      ["quote", "WSO", "2026-10-26", "0.3.1"],
    ]);
  });

  it("reports a per-symbol error without sinking the others", async () => {
    const d = deps({
      LII: "LII.json",
      "WSO-B": "recorded-rate-limit-burst.json",
    });
    const res = await get(
      createQuotesHandler(() => d.deps),
      "?symbols=LII,WSO-B",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quotes.map((q: { symbol: string }) => q.symbol)).toEqual([
      "LII",
    ]);
    expect(body.errors).toEqual([
      {
        symbol: "WSO-B",
        code: "PRICE_RATE_LIMITED",
        message:
          "The price provider's daily limit is reached; enter the price by hand or try tomorrow",
      },
    ]);
  });

  it("is 429 when every symbol is rate-limited", async () => {
    const d = deps({ LII: "synthetic-rate-limit.json" });
    const res = await get(
      createQuotesHandler(() => d.deps),
      "?symbols=LII",
    );
    expect(res.status).toBe(429);
  });

  it("is 502 when the provider fails for every symbol", async () => {
    const d = deps({});
    const res = await get(
      createQuotesHandler(() => d.deps),
      "?symbols=LII",
    );
    expect(res.status).toBe(502);
    expect((await res.json()).errors[0].code).toBe("PRICE_UNAVAILABLE");
  });

  it.each([
    ["", "Enter one or more tickers, for example LII"],
    ["?symbols=", "Enter one or more tickers, for example LII"],
    [
      "?symbols=LII,bad$",
      "A ticker is 1–10 letters, digits, dots or dashes, starting with a letter",
    ],
    [
      `?symbols=${Array.from({ length: 13 }, (_, i) => `T${i}`).join(",")}`,
      "At most 12 tickers at a time",
    ],
  ])("%s is 400", async (q, message) => {
    const d = deps({});
    const res = await get(
      createQuotesHandler(() => d.deps),
      q,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(message);
    expect(d.calls).toEqual([]);
  });

  it("asks the provider once per distinct symbol", async () => {
    const d = deps({ LII: "LII.json" });
    await get(
      createQuotesHandler(() => d.deps),
      "?symbols=LII,lii,LII",
    );
    expect(d.calls).toEqual(["LII"]);
  });

  it("never puts the key in a response or a log", async () => {
    const d = deps({ LII: "synthetic-rate-limit.json", WSO: "WSO.json" });
    const res = await get(
      createQuotesHandler(() => d.deps),
      "?symbols=LII,WSO",
    );
    expect(await res.text()).not.toContain(KEY);
    expect(d.logs.join("\n")).not.toContain(KEY);
    expect(d.logs.length).toBeGreaterThan(0);
  });
});
