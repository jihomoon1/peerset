import { describe, expect, it } from "vitest";
import { buildComps, type CompsPeer } from "@/domain/comps";
import type { QuoteSnapshot } from "@/domain/types";
import { exportState } from "@/ui/exportRequest";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// The Export button's request and state (blueprint §6): the inputs only, the
// prices the screen applied, and disabled until the table has a usable row.

const [lii, aaon] = await Promise.all([
  fixtureFundamentals("LII"),
  fixtureFundamentals("AAON"),
]);
const quote = (symbol: string, close: number): QuoteSnapshot => ({
  symbol,
  close,
  currency: "USD",
  asOfDate: "2026-10-23",
  source: "user_entered",
  retrievedAt: "2026-10-26T12:00:00Z",
});
const peer = (state: CompsPeer["state"]): CompsPeer => ({
  ticker: "AAON",
  origin: "suggested",
  reason: "t",
  state,
});
const base = {
  target: "LII",
  added: ["TT"],
  removed: ["GGG"],
  priceDate: "2026-10-23",
};

describe("exportState", () => {
  it("sends the inputs and the applied prices, never computed numbers", () => {
    const quotes = [quote("LII", 500), quote("AAON", 100)];
    const table = buildComps(
      lii,
      [peer({ kind: "loaded", fundamentals: aaon })],
      quotes,
      "2026-10-26",
    );
    const s = exportState({ ...base, table, quotes });
    expect(s.disabledReason).toBeNull();
    expect(s.request).toEqual({
      target: "LII",
      add: ["TT"],
      remove: ["GGG"],
      prices: { LII: 500, AAON: 100 },
      priceDate: "2026-10-23",
    });
  });

  it("omits the price date when no price is applied", () => {
    const table = buildComps(lii, [], [], "2026-10-26");
    const s = exportState({ ...base, table, quotes: [] });
    expect(s.request.prices).toEqual({});
    expect(s.request).not.toHaveProperty("priceDate");
    expect(s.disabledReason).toBeNull(); // the target's LTM revenue is a value
    expect(s.notANumber).toBeGreaterThan(0);
  });

  it("is disabled while a peer is still loading", () => {
    const table = buildComps(
      lii,
      [peer({ kind: "loading" })],
      [],
      "2026-10-26",
    );
    expect(exportState({ ...base, table, quotes: [] }).disabledReason).toMatch(
      /loading/i,
    );
  });

  it("is disabled while the price date is invalid", () => {
    const table = buildComps(lii, [], [], "2026-10-26");
    expect(
      exportState({ ...base, table, quotes: [], dateError: "bad date" })
        .disabledReason,
    ).toMatch(/price date/i);
  });

  it("counts the cells shown as NM, — or Unsupported", () => {
    const quotes = [quote("LII", 500)];
    const table = buildComps(lii, [], quotes, "2026-10-26");
    expect(exportState({ ...base, table, quotes }).notANumber).toBe(0);
  });
});
