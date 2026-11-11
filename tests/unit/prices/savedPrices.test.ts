import { describe, expect, it } from "vitest";
import {
  QUOTE_CACHE_PREFIX,
  type KeyValueStorage,
} from "@/prices/browserAlphaVantage";
import {
  clearTypedPrices,
  readTypedPrice,
  removeTypedPrice,
  restorePrices,
  saveTypedPrice,
  TYPED_PRICE_PREFIX,
} from "@/prices/savedPrices";

// Prices remembered in the browser (savedPrices.ts): typed prices come back only
// under the date they were saved with; key-filled closes follow the quote cache.

function fakeStorage(): KeyValueStorage & { map: Map<string, string> } {
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

const ANALYSIS = "2026-11-10";
// Tuesday afternoon in New York; a close fetched that morning is still current.
const NOW = new Date("2026-11-10T20:00:00Z");
const cache = (s: KeyValueStorage, symbol: string, close: number) =>
  s.setItem(
    QUOTE_CACHE_PREFIX + symbol,
    JSON.stringify({
      close,
      asOfDate: "2026-11-09",
      fetchedAt: "2026-11-10T15:00:00.000Z",
    }),
  );

describe("typed prices", () => {
  it("round-trip with their date", () => {
    const s = fakeStorage();
    saveTypedPrice(s, "LII", "500.25", "2026-11-06");
    expect(readTypedPrice(s, "LII", ANALYSIS)).toEqual({
      price: "500.25",
      asOfDate: "2026-11-06",
    });
  });

  it("an invalid price or date is never saved", () => {
    const s = fakeStorage();
    saveTypedPrice(s, "LII", "abc", "2026-11-06");
    saveTypedPrice(s, "LII", "0", "2026-11-06");
    saveTypedPrice(s, "LII", "-4", "2026-11-06");
    saveTypedPrice(s, "LII", "1000000", "2026-11-06");
    saveTypedPrice(s, "LII", "500", "2026-13-40");
    expect(s.map.size).toBe(0);
  });

  it("a damaged entry or a date after the analysis date reads as nothing", () => {
    const s = fakeStorage();
    s.setItem(TYPED_PRICE_PREFIX + "LII", "{not json");
    expect(readTypedPrice(s, "LII", ANALYSIS)).toBeNull();
    saveTypedPrice(s, "WSO", "450", "2026-11-12");
    expect(readTypedPrice(s, "WSO", ANALYSIS)).toBeNull();
    expect(readTypedPrice(null, "WSO", ANALYSIS)).toBeNull();
  });

  it("remove forgets one; clear forgets all typed prices and nothing else", () => {
    const s = fakeStorage();
    saveTypedPrice(s, "LII", "500", "2026-11-06");
    saveTypedPrice(s, "WSO", "450", "2026-11-06");
    s.setItem("peerset.avKey", "KEY");
    removeTypedPrice(s, "LII");
    expect(readTypedPrice(s, "LII", ANALYSIS)).toBeNull();
    clearTypedPrices(s);
    expect([...s.map.keys()]).toEqual(["peerset.avKey"]);
  });
});

describe("restorePrices", () => {
  const base = { analysisDate: ANALYSIS, now: NOW };

  it("nothing saved: nothing restored, never a default", () => {
    expect(
      restorePrices({
        ...base,
        storage: fakeStorage(),
        tickers: ["LII", "WSO"],
        typedDate: null,
      }),
    ).toEqual({ inputs: {}, filled: {} });
  });

  it("typed prices come back and set the price date they were saved under", () => {
    const s = fakeStorage();
    saveTypedPrice(s, "LII", "500", "2026-11-06");
    saveTypedPrice(s, "WSO", "450", "2026-11-06");
    expect(
      restorePrices({
        ...base,
        storage: s,
        tickers: ["LII", "WSO", "GGG"],
        typedDate: null,
      }),
    ).toEqual({
      inputs: { LII: "500", WSO: "450" },
      filled: {},
      priceDate: "2026-11-06",
    });
  });

  it("saved under different dates: only the most recent date's prices come back", () => {
    const s = fakeStorage();
    saveTypedPrice(s, "LII", "500", "2026-11-06");
    saveTypedPrice(s, "WSO", "440", "2026-10-30");
    const r = restorePrices({
      ...base,
      storage: s,
      tickers: ["LII", "WSO"],
      typedDate: null,
    });
    expect(r.inputs).toEqual({ LII: "500" });
    expect(r.priceDate).toBe("2026-11-06");
  });

  it("with a typed price already on the page, only prices of that date come back and the date stays", () => {
    const s = fakeStorage();
    saveTypedPrice(s, "LII", "500", "2026-11-06");
    saveTypedPrice(s, "WSO", "440", "2026-10-30");
    const r = restorePrices({
      ...base,
      storage: s,
      tickers: ["LII", "WSO"],
      typedDate: "2026-10-30",
    });
    expect(r).toEqual({ inputs: { WSO: "440" }, filled: {} });
  });

  it("a current key-filled close wins over a typed price and keeps its own date", () => {
    const s = fakeStorage();
    saveTypedPrice(s, "LII", "500", "2026-11-06");
    cache(s, "LII", 512.34);
    expect(
      restorePrices({ ...base, storage: s, tickers: ["LII"], typedDate: null }),
    ).toEqual({
      inputs: { LII: "512.34" },
      filled: { LII: { close: 512.34, asOfDate: "2026-11-09" } },
    });
  });

  it("an expired key-filled close is not restored", () => {
    const s = fakeStorage();
    cache(s, "LII", 512.34);
    const later = new Date("2026-11-13T20:00:00Z");
    expect(
      restorePrices({
        ...base,
        now: later,
        storage: s,
        tickers: ["LII"],
        typedDate: null,
      }),
    ).toEqual({ inputs: {}, filled: {} });
  });
});
