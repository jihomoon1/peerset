import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildComps, STAT_COLUMNS, type CompsTable } from "@/domain/comps";
import { IMPLIED_POINTS, impliedValuation } from "@/domain/impliedValuation";
import type { Metric, QuoteSnapshot } from "@/domain/types";
import { fixtureFundamentals } from "../helpers/fundamentals";

// Comps golden (M4b): LII against CARR, AAON, TT, WSO and JCI at documented test prices.
// The JSON computes every market cap, EV, multiple and statistic from its listed inputs
// (with the arithmetic written out), independently of the engine. Market cap and EV must
// match to the dollar; ratios and statistics to 1e-9 relative.

const golden = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "comps-LII-2026Q2.json"), "utf8"),
);
interface Exclusion {
  ticker: string;
  columns: (typeof ROW_KEYS)[number][];
  code: string;
}
const ROW_KEYS = [
  "revenue",
  "ebitda",
  "ebitdaMargin",
  "evRevenue",
  "evEbitda",
  "pe",
] as const;

const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

function value(m: Metric): number {
  if (m.status !== "reported" && m.status !== "derived")
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m.value;
}

let table: CompsTable;
beforeAll(async () => {
  const tickers = [golden.target, ...golden.peers] as (
    "LII" | "CARR" | "AAON" | "TT" | "WSO" | "JCI"
  )[];
  const fs = await Promise.all(tickers.map((t) => fixtureFundamentals(t)));
  const quotes: QuoteSnapshot[] = Object.entries(
    golden.prices.close as Record<string, number>,
  ).map(([symbol, close]) => ({
    symbol,
    close,
    currency: "USD",
    asOfDate: golden.prices.asOfDate,
    source: "user_entered",
    retrievedAt: "2026-10-26T12:00:00Z",
  }));
  table = buildComps(
    fs[0],
    golden.peers.map((ticker: string, i: number) => ({
      ticker,
      origin: "suggested",
      reason: "golden",
      state: { kind: "loaded", fundamentals: fs[i + 1] },
    })),
    quotes,
    golden.analysisDate,
  );
});

describe("comps golden: LII vs CARR, AAON, TT, WSO, JCI", () => {
  const rowOf = (t: string) =>
    t === golden.target
      ? table.target
      : table.peers.find((r) => r.ticker === t)!;

  it.each([golden.target, ...golden.peers])(
    "%s: market cap and EV to the dollar",
    (t) => {
      const cells = rowOf(t).cells!;
      expect(value(cells.marketCap)).toBe(golden.rows[t].marketCap);
      expect(value(cells.ev)).toBe(golden.rows[t].ev);
    },
  );

  it.each([golden.target, ...golden.peers])(
    "%s: LTM inputs, margin and multiples",
    (t) => {
      const cells = rowOf(t).cells!;
      for (const k of ROW_KEYS) {
        const want = golden.rows[t][k];
        if (want === null)
          expect(cells[k].status, `${t} ${k}`).toBe("unsupported");
        else expect(close(value(cells[k]), want), `${t} ${k}`).toBe(true);
      }
    },
  );

  it.each(golden.exclusions as Exclusion[])(
    "$ticker is Unsupported in $columns with $code",
    ({ ticker, columns, code }) => {
      for (const c of columns) {
        expect(rowOf(ticker).cells![c]).toMatchObject({
          status: "unsupported",
          reason: { code },
        });
        expect(table.stats[c].excluded).toContainEqual(
          expect.objectContaining({ ticker, status: "unsupported" }),
        );
      }
    },
  );

  it.each(STAT_COLUMNS)("%s statistics over the five peers", (c) => {
    const want = golden.stats[c];
    const got = table.stats[c];
    expect(got.nValid).toBe(want.nValid);
    expect(got.nExcluded).toBe(want.nExcluded);
    expect(got.used.map((u) => u.ticker)).toEqual(want.used);
    expect(got.excluded.map((e) => e.ticker)).toEqual(want.excluded);
    for (const s of ["mean", "median", "high", "low", "p25", "p75"] as const)
      expect(close(got[s]!, want[s]), `${c} ${s}`).toBe(true);
  });

  it("the target never enters a statistic", () => {
    for (const c of STAT_COLUMNS)
      expect(table.stats[c].used.map((u) => u.ticker)).not.toContain("LII");
  });

  it("no row is lagging: every LTM ends on the peer median", () => {
    expect(table.lag.peerMedianLtmEnd).toBe(golden.peerMedianLtmEnd);
    for (const r of [table.target, ...table.peers])
      expect(r.lag).toBeUndefined();
  });

  it("no value is NM at these prices", () => {
    for (const r of [table.target, ...table.peers])
      for (const k of ROW_KEYS) expect(r.cells![k].status).not.toBe("nm");
  });

  it.each(["evEbitda", "evRevenue"] as const)(
    "implied valuation of LII at the peer %s quartiles (methodology §13)",
    (key) => {
      const v = table.target.valuation!;
      const r = impliedValuation({
        revenue: table.target.cells!.revenue,
        ebitda: table.target.cells!.ebitda,
        totalDebt: v.bridge.totalDebt,
        cash: v.bridge.cashAndInvestments,
        shares: v.shareClasses.map((c) => c.shares),
        stats: table.stats,
      })[key];
      const want = golden.impliedValuation[key];
      expect(r.status).toBe("ok");
      if (r.status !== "ok") return;
      expect(r.metricValue).toBe(want.metricValue);
      expect(r.nPeers).toBe(want.nPeers);
      for (const p of IMPLIED_POINTS)
        for (const f of [
          "multiple",
          "impliedEv",
          "impliedEquity",
          "impliedPrice",
        ] as const)
          expect(close(r.points[p][f], want.points[p][f]), `${p} ${f}`).toBe(
            true,
          );
    },
  );
});
