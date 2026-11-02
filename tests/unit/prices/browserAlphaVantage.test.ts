import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyMessage } from "@/prices/alphaVantage";
import {
  BROWSER_MIN_INTERVAL_MS,
  clearQuoteCache,
  fillQuotes,
  fillSummary,
  forgetRememberedKey,
  KEY_STORAGE_NAME,
  type KeyValueStorage,
  MAX_FILL_SYMBOLS,
  QUOTE_CACHE_PREFIX,
  readCachedQuote,
  readRememberedKey,
  rememberKey,
} from "@/prices/browserAlphaVantage";

// v1.1 bring-your-own-key fill: the visitor's browser calls Alpha Vantage with the
// visitor's key. Pacing, limit payloads, unknown symbols, the cache and key hygiene.

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
const KEY = "MYSECRETKEY98765";
// Monday 2026-10-26, 10:00 ET: the latest finished close is Friday 2026-10-23.
const START = Date.parse("2026-10-26T14:00:00.000Z");

const INVALID_KEY = {
  "Error Message":
    "the parameter apikey is invalid or missing. Please claim your free API key on (https://www.alphavantage.co/support/#api-key).",
};

function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

function throwingStorage(): KeyValueStorage {
  const boom = () => {
    throw new Error("SecurityError");
  };
  return {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    get length(): number {
      return boom();
    },
    key: boom,
  };
}

// A fake clock: sleep advances it, fetch records the time each request started.
function harness(answers: Record<string, unknown>, startMs = START) {
  let t = startMs;
  const starts: { symbol: string; at: number; url: string }[] = [];
  const fetch: typeof globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const symbol = url.searchParams.get("symbol")!;
    starts.push({ symbol, at: t, url: url.toString() });
    const answer = answers[symbol];
    if (answer === "network") throw new TypeError(`failed ${url.toString()}`);
    if (answer === 500) return new Response("oops", { status: 500 });
    return new Response(
      JSON.stringify(answer ?? body("synthetic-error.json")),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
  return {
    starts,
    fetch,
    now: () => new Date(t),
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const OK = {
  LII: body("LII.json"),
  WSO: body("WSO.json"),
  "WSO-B": body("WSO-B.json"),
};

describe("classifyMessage", () => {
  it("reads the four recorded payload kinds", () => {
    expect(classifyMessage(body("synthetic-rate-limit.json"))).toBe(
      "daily_limit",
    );
    expect(classifyMessage(body("synthetic-note.json"))).toBe("daily_limit");
    expect(classifyMessage(body("recorded-rate-limit-burst.json"))).toBe(
      "burst",
    );
    expect(classifyMessage(body("synthetic-error.json"))).toBe(
      "unknown_symbol",
    );
    expect(classifyMessage(INVALID_KEY)).toBe("invalid_key");
    expect(classifyMessage(body("LII.json"))).toBeNull();
  });
});

describe("fillQuotes", () => {
  it("fills each symbol in order, at least 1.2 s apart, as user-key quotes", async () => {
    const h = harness(OK);
    const storage = memoryStorage();
    const result = await fillQuotes({
      symbols: ["LII", "WSO", "WSO-B"],
      apiKey: KEY,
      ...h,
      storage,
    });
    expect(result.stopped).toBeNull();
    expect(result.rows.map((r) => r.status)).toEqual([
      "filled",
      "filled",
      "filled",
    ]);
    const row = result.rows[2];
    expect(row.status === "filled" && row.quote).toMatchObject({
      symbol: "WSO-B",
      asOfDate: "2026-10-23",
      source: "alpha_vantage_user_key",
    });
    // class symbol sent in SEC's spelling
    expect(h.starts.map((s) => s.symbol)).toEqual(["LII", "WSO", "WSO-B"]);
    const gaps = h.starts.slice(1).map((s, i) => s.at - h.starts[i].at);
    expect(gaps.every((g) => g >= BROWSER_MIN_INTERVAL_MS)).toBe(true);
    expect(BROWSER_MIN_INTERVAL_MS).toBe(1_200);
  });

  it("stops at the daily limit and keeps what was already filled", async () => {
    const h = harness({
      ...OK,
      WSO: body("synthetic-rate-limit.json"),
    });
    const result = await fillQuotes({
      symbols: ["LII", "WSO", "WSO-B"],
      apiKey: KEY,
      ...h,
      storage: null,
    });
    expect(result.stopped).toBe("daily_limit");
    expect(result.rows.map((r) => r.status)).toEqual([
      "filled",
      "not_tried",
      "not_tried",
    ]);
    expect(h.starts).toHaveLength(2); // nothing sent after the limit payload
    expect(fillSummary(result)).toBe(
      "Alpha Vantage's daily limit was reached; filled 1 of 3. Enter the rest by hand or try tomorrow.",
    );
  });

  it("stops on a burst notice with its own message", async () => {
    const h = harness({ ...OK, LII: body("recorded-rate-limit-burst.json") });
    const result = await fillQuotes({
      symbols: ["LII", "WSO"],
      apiKey: KEY,
      ...h,
      storage: null,
    });
    expect(result.stopped).toBe("burst");
    expect(fillSummary(result)).toMatch(
      /asked for slower requests; filled 0 of 2/,
    );
  });

  it("stops on an invalid key", async () => {
    const h = harness({ LII: INVALID_KEY, WSO: INVALID_KEY });
    const result = await fillQuotes({
      symbols: ["LII", "WSO"],
      apiKey: KEY,
      ...h,
      storage: null,
    });
    expect(result.stopped).toBe("invalid_key");
    expect(h.starts).toHaveLength(1);
    expect(fillSummary(result)).toBe(
      "Alpha Vantage didn't accept this key. Check it at alphavantage.co.",
    );
  });

  it("leaves an unknown symbol empty with the reason and carries on", async () => {
    const h = harness({ LII: OK.LII, ZZZZ: body("synthetic-error.json") });
    const result = await fillQuotes({
      symbols: ["ZZZZ", "LII"],
      apiKey: KEY,
      ...h,
      storage: null,
    });
    expect(result.stopped).toBeNull();
    expect(result.rows[0]).toEqual({
      symbol: "ZZZZ",
      status: "unknown_symbol",
      reason: "Alpha Vantage doesn't know this symbol",
    });
    expect(result.rows[1].status).toBe("filled");
    expect(fillSummary(result)).toBe(
      "Filled 1 of 2 prices; 1 left for you to enter.",
    );
  });

  it(`refuses more than ${MAX_FILL_SYMBOLS} symbols per click`, async () => {
    const symbols = Array.from({ length: 15 }, (_, i) => `S${i}`);
    const answers = Object.fromEntries(symbols.map((s) => [s, OK.LII]));
    // fixture Meta Data names LII, so serve per-symbol copies
    for (const s of symbols)
      answers[s] = {
        ...(OK.LII as object),
        "Meta Data": { "2. Symbol": s },
      };
    const h = harness(answers);
    const result = await fillQuotes({
      symbols,
      apiKey: KEY,
      ...h,
      storage: null,
    });
    expect(h.starts).toHaveLength(MAX_FILL_SYMBOLS);
    expect(result.rows.slice(MAX_FILL_SYMBOLS).map((r) => r.status)).toEqual([
      "not_tried",
      "not_tried",
    ]);
  });

  it("never puts the key in a row reason, even when fetch throws with the URL", async () => {
    const h = harness({ LII: "network", WSO: 500, "WSO-B": { odd: true } });
    const result = await fillQuotes({
      symbols: ["LII", "WSO", "WSO-B", "bad sym"],
      apiKey: KEY,
      ...h,
      storage: null,
    });
    expect(result.rows.map((r) => r.status)).toEqual([
      "failed",
      "failed",
      "failed",
      "failed",
    ]);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(fillSummary(result)).not.toContain(KEY);
  });

  it("reports progress row by row", async () => {
    const h = harness(OK);
    const seen: string[] = [];
    await fillQuotes({
      symbols: ["LII", "WSO"],
      apiKey: KEY,
      ...h,
      storage: null,
      onProgress: (row, done, total) =>
        seen.push(`${row.symbol}:${row.status}:${done}/${total}`),
    });
    expect(seen).toEqual(["LII:filled:1/2", "WSO:filled:2/2"]);
  });

  it("stops when aborted", async () => {
    const h = harness(OK);
    const ctrl = new AbortController();
    const result = await fillQuotes({
      symbols: ["LII", "WSO"],
      apiKey: KEY,
      ...h,
      storage: null,
      signal: ctrl.signal,
      onProgress: () => ctrl.abort(),
    });
    expect(result.stopped).toBe("aborted");
    expect(h.starts).toHaveLength(1);
  });
});

describe("quote cache", () => {
  it("serves a repeat fill the same day without any request", async () => {
    const storage = memoryStorage();
    const first = harness(OK);
    await fillQuotes({ symbols: ["LII"], apiKey: KEY, ...first, storage });
    const again = harness(OK, START + 3 * 3_600_000);
    const result = await fillQuotes({
      symbols: ["LII"],
      apiKey: KEY,
      ...again,
      storage,
    });
    expect(again.starts).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      status: "cached",
      quote: { close: 376.01, asOfDate: "2026-10-23" },
    });
    // the key is never written to the quote cache
    expect([...storage.map.values()].join()).not.toContain(KEY);
  });

  it("expires at 6 p.m. ET on the next weekday", () => {
    const storage = memoryStorage();
    storage.setItem(
      `${QUOTE_CACHE_PREFIX}LII`,
      JSON.stringify({
        close: 376.01,
        asOfDate: "2026-10-23",
        fetchedAt: "2026-10-26T14:00:00.000Z",
      }),
    );
    // 2026-10-26 18:00 ET = 22:00 UTC (EDT)
    expect(
      readCachedQuote(storage, "LII", new Date("2026-10-26T21:59:00Z")),
    ).not.toBeNull();
    expect(
      readCachedQuote(storage, "LII", new Date("2026-10-26T22:00:00Z")),
    ).toBeNull();
  });

  it("ignores a malformed entry", () => {
    const storage = memoryStorage();
    storage.setItem(`${QUOTE_CACHE_PREFIX}LII`, "{not json");
    expect(readCachedQuote(storage, "LII", new Date(START))).toBeNull();
    storage.setItem(
      `${QUOTE_CACHE_PREFIX}LII`,
      JSON.stringify({ close: 0, asOfDate: "2026-10-23", fetchedAt: "x" }),
    );
    expect(readCachedQuote(storage, "LII", new Date(START))).toBeNull();
  });

  it("works when storage throws on every access", async () => {
    const h = harness(OK);
    const storage = throwingStorage();
    const result = await fillQuotes({
      symbols: ["LII"],
      apiKey: KEY,
      ...h,
      storage,
    });
    expect(result.rows[0].status).toBe("filled");
    expect(readRememberedKey(storage)).toBe("");
    expect(() => rememberKey(storage, KEY)).not.toThrow();
    expect(() => clearQuoteCache(storage)).not.toThrow();
  });

  it("clears only PeerSet's quote entries", () => {
    const storage = memoryStorage();
    storage.setItem(`${QUOTE_CACHE_PREFIX}LII`, "{}");
    storage.setItem(`${QUOTE_CACHE_PREFIX}WSO`, "{}");
    storage.setItem("other", "keep");
    clearQuoteCache(storage);
    expect([...storage.map.keys()]).toEqual(["other"]);
  });
});

describe("remembered key", () => {
  it("stores, reads and forgets the key under one name", () => {
    const storage = memoryStorage();
    expect(readRememberedKey(storage)).toBe("");
    rememberKey(storage, KEY);
    expect(storage.getItem(KEY_STORAGE_NAME)).toBe(KEY);
    expect(readRememberedKey(storage)).toBe(KEY);
    forgetRememberedKey(storage);
    expect(readRememberedKey(storage)).toBe("");
  });
});
