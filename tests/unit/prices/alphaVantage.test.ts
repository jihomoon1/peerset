import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PriceRateLimitedError, PriceUnavailableError } from "@/lib/errors";
import {
  createAlphaVantageProvider,
  parseDailySeries,
  quoteUrl,
  toProviderSymbol,
} from "@/prices/alphaVantage";
import { priceProviderName } from "@/prices/provider";

// Blueprint §9: TIME_SERIES_DAILY, compact; the latest row's close and date. Errors
// and rate limits arrive as HTTP 200 with a message key instead of the series.

const DIR = path.join(
  import.meta.dirname,
  "..",
  "..",
  "fixtures",
  "prices",
  "alphavantage",
);
const body = (file: string): unknown =>
  JSON.parse(readFileSync(path.join(DIR, file), "utf8"));
const RETRIEVED = "2026-10-26T14:00:00.000Z";
const KEY = "TESTKEY123456789";

describe("quoteUrl", () => {
  it("asks www.alphavantage.co for the compact daily series", () => {
    const url = quoteUrl("LII", KEY);
    expect(url.origin).toBe("https://www.alphavantage.co");
    expect(url.pathname).toBe("/query");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      function: "TIME_SERIES_DAILY",
      symbol: "LII",
      outputsize: "compact",
      apikey: KEY,
    });
  });
});

describe("parseDailySeries", () => {
  it("takes the latest row's close and date", () => {
    expect(
      parseDailySeries(body("synthetic-ok.json"), "SYN", RETRIEVED),
    ).toEqual({
      symbol: "SYN",
      close: 102.75,
      currency: "USD",
      asOfDate: "2026-10-23",
      source: "alpha_vantage",
      retrievedAt: RETRIEVED,
    });
  });

  it("picks the latest date even when rows arrive out of order", () => {
    const b = body("synthetic-ok.json") as {
      "Time Series (Daily)": Record<string, unknown>;
    };
    const rows = Object.entries(b["Time Series (Daily)"]).reverse();
    const shuffled = { ...b, "Time Series (Daily)": Object.fromEntries(rows) };
    expect(parseDailySeries(shuffled, "SYN", RETRIEVED).asOfDate).toBe(
      "2026-10-23",
    );
  });

  it("an 'Error Message' payload is PRICE_UNAVAILABLE", () => {
    expect(() =>
      parseDailySeries(body("synthetic-error.json"), "NOPE", RETRIEVED),
    ).toThrow(PriceUnavailableError);
  });

  it.each(["synthetic-rate-limit.json", "synthetic-note.json"])(
    "%s is PRICE_RATE_LIMITED",
    (file) => {
      expect(() => parseDailySeries(body(file), "SYN", RETRIEVED)).toThrow(
        PriceRateLimitedError,
      );
    },
  );

  it.each([
    ["an empty object", {}],
    ["no rows", { "Meta Data": {}, "Time Series (Daily)": {} }],
    [
      "a non-numeric close",
      {
        "Time Series (Daily)": { "2026-10-23": { "4. close": "n/a" } },
      },
    ],
    [
      "a zero close",
      {
        "Time Series (Daily)": { "2026-10-23": { "4. close": "0.0000" } },
      },
    ],
    [
      "a bad date key",
      {
        "Time Series (Daily)": { "10/23/2026": { "4. close": "1.0000" } },
      },
    ],
    ["not an object", "<html>"],
  ])("%s is PRICE_UNAVAILABLE", (_, b) => {
    expect(() => parseDailySeries(b, "SYN", RETRIEVED)).toThrow(
      PriceUnavailableError,
    );
  });

  it("a series for another symbol is PRICE_UNAVAILABLE", () => {
    expect(() =>
      parseDailySeries(body("synthetic-ok.json"), "LII", RETRIEVED),
    ).toThrow(PriceUnavailableError);
  });
});

describe("toProviderSymbol", () => {
  it("passes a plain ticker through", () => {
    expect(toProviderSymbol("LII")).toBe("LII");
  });
});

describe("createAlphaVantageProvider", () => {
  const okFetch = (b: unknown, status = 200) => {
    const urls: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(JSON.stringify(b), { status });
    }) as typeof fetch;
    return { fetchFn, urls };
  };

  it("fetches once and returns the snapshot under SEC's ticker spelling", async () => {
    const { fetchFn, urls } = okFetch(body("synthetic-ok.json"));
    const provider = createAlphaVantageProvider({
      apiKey: KEY,
      fetch: fetchFn,
      now: () => new Date(RETRIEVED),
    });
    const q = await provider.getQuote("SYN");
    expect(q.close).toBe(102.75);
    expect(q.symbol).toBe("SYN");
    expect(urls).toHaveLength(1);
  });

  it("never puts the key in an error's message or detail", async () => {
    const { fetchFn } = okFetch({
      Information: `Your key ${KEY} reached the daily limit`,
    });
    const provider = createAlphaVantageProvider({
      apiKey: KEY,
      fetch: fetchFn,
      now: () => new Date(RETRIEVED),
    });
    const err = await provider.getQuote("SYN").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PriceRateLimitedError);
    const e = err as PriceRateLimitedError;
    expect(`${e.message} ${e.detail} ${e.userMessage}`).not.toContain(KEY);
  });

  it("an HTTP error is PRICE_UNAVAILABLE without the URL", async () => {
    const { fetchFn } = okFetch({}, 503);
    const provider = createAlphaVantageProvider({
      apiKey: KEY,
      fetch: fetchFn,
      now: () => new Date(RETRIEVED),
    });
    const err = (await provider
      .getQuote("SYN")
      .catch((e: unknown) => e)) as PriceUnavailableError;
    expect(err).toBeInstanceOf(PriceUnavailableError);
    expect(err.detail).toBe("SYN: HTTP 503");
  });

  it("a network failure is PRICE_UNAVAILABLE", async () => {
    const provider = createAlphaVantageProvider({
      apiKey: KEY,
      fetch: (async () => {
        throw new TypeError(`fetch failed for apikey=${KEY}`);
      }) as typeof fetch,
      now: () => new Date(RETRIEVED),
    });
    const err = (await provider
      .getQuote("SYN")
      .catch((e: unknown) => e)) as PriceUnavailableError;
    expect(err).toBeInstanceOf(PriceUnavailableError);
    expect(err.detail).not.toContain(KEY);
  });

  it("refuses a ticker that isn't a plain symbol", async () => {
    const { fetchFn, urls } = okFetch(body("synthetic-ok.json"));
    const provider = createAlphaVantageProvider({
      apiKey: KEY,
      fetch: fetchFn,
      now: () => new Date(RETRIEVED),
    });
    await expect(provider.getQuote("SYN&function=X")).rejects.toThrow(
      PriceUnavailableError,
    );
    expect(urls).toHaveLength(0);
  });
});

describe("recorded Alpha Vantage responses (2026-10-26)", () => {
  it.each([
    ["LII.json", "LII", 376.01],
    ["WSO.json", "WSO", 322.98],
    ["WSO-B.json", "WSO-B", 287.5],
  ])("%s: close and trading date of the latest row", (file, symbol, close) => {
    expect(parseDailySeries(body(file), symbol, RETRIEVED)).toMatchObject({
      symbol,
      close,
      asOfDate: "2026-10-23",
      source: "alpha_vantage",
    });
  });

  it("the per-second burst notice is PRICE_RATE_LIMITED", () => {
    expect(() =>
      parseDailySeries(
        body("recorded-rate-limit-burst.json"),
        "WSO-B",
        RETRIEVED,
      ),
    ).toThrow(PriceRateLimitedError);
  });
});

describe("priceProviderName", () => {
  it.each([
    [{}, "user"],
    [{ PRICE_PROVIDER: "user" }, "user"],
    [{ PRICE_PROVIDER: "alpha_vantage" }, "alpha_vantage"],
    [{ PRICE_PROVIDER: "ALPHA_VANTAGE" }, "user"],
    [{ PRICE_PROVIDER: "other" }, "user"],
  ])("%j → %s", (env, name) => expect(priceProviderName(env)).toBe(name));
});

describe("pacing (Alpha Vantage free tier: about 1 request per second)", () => {
  it("spaces calls at least 1.1 s apart and sends them one at a time", async () => {
    let clock = 0;
    const waits: number[] = [];
    const starts: number[] = [];
    const provider = createAlphaVantageProvider({
      apiKey: KEY,
      fetch: (async () => {
        starts.push(clock);
        return new Response(JSON.stringify(body("synthetic-ok.json")));
      }) as typeof fetch,
      now: () => new Date(clock),
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    await Promise.all([
      provider.getQuote("SYN"),
      provider.getQuote("SYN"),
      provider.getQuote("SYN"),
    ]);
    expect(starts).toEqual([0, 1100, 2200]);
    expect(waits).toEqual([1100, 1100]);
  });
});

describe("provider prices get the same limits as typed ones (blueprint §13)", () => {
  it("a close of 1,000,000 or more is PRICE_UNAVAILABLE", () => {
    expect(() =>
      parseDailySeries(
        {
          "Time Series (Daily)": {
            "2026-10-23": { "4. close": "1000000.0000" },
          },
        },
        "SYN",
        RETRIEVED,
      ),
    ).toThrow(PriceUnavailableError);
  });
});
