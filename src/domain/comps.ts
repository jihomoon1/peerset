// The comps table (blueprint §6): the target row, then one row per peer, each priced
// with priceCompany, the same code the single-company view uses, so NM and statuses
// are exactly methodology §10's. Statistics run over loaded peers only (§11); the lag
// flag compares each row's LTM end with the peers' median LTM end (§12). Pure and
// isomorphic: the browser recomputes the table on every price change.

import { addDays, daysBetween } from "./dates";
import type { CompanyFundamentals } from "./fundamentals";
import { LAG_FLAG_DAYS } from "./policy";
import { summarize, type MetricStats, type StatEntry } from "./stats";
import type { IssuerKind, Metric, MetricWarning, QuoteSnapshot } from "./types";
import { priceCompany, type Valuation } from "./valuation";

// The operating-company columns (v1). Digital-asset and bank tables use their own
// lists below (methodology §13B, 0.5.0), so operating tables are unchanged.
export const COMPS_COLUMNS = [
  "price",
  "marketCap",
  "ev",
  "revenue",
  "ebitda",
  "ebitdaMargin",
  "evRevenue",
  "evEbitda",
  "pe",
] as const;

// §13C, §13D: every column any kind can show, in display order.
export const ALL_COMPS_COLUMNS = [
  ...COMPS_COLUMNS,
  "digitalAssets",
  "mcapToDigitalAssets",
  "commonEquity",
  "tangibleCommonEquity",
  "rotce",
  "priceToBook",
  "priceToTangibleBook",
] as const;
export type CompsColumn = (typeof ALL_COMPS_COLUMNS)[number];

export const KIND_COLUMNS: Record<IssuerKind, readonly CompsColumn[]> = {
  operating: COMPS_COLUMNS,
  digitalAsset: [...COMPS_COLUMNS, "digitalAssets", "mcapToDigitalAssets"],
  bank: [
    "price",
    "marketCap",
    "commonEquity",
    "tangibleCommonEquity",
    "rotce",
    "pe",
    "priceToBook",
    "priceToTangibleBook",
  ],
};

// The table's columns follow the target's kind.
export function columnsForKind(
  kind: IssuerKind | null,
): readonly CompsColumn[] {
  return KIND_COLUMNS[kind ?? "operating"];
}

// Price has no statistic: an average share price across companies means nothing.
export const STAT_COLUMNS = COMPS_COLUMNS.filter(
  (c): c is Exclude<(typeof COMPS_COLUMNS)[number], "price"> => c !== "price",
);
export const ALL_STAT_COLUMNS = ALL_COMPS_COLUMNS.filter(
  (c): c is Exclude<CompsColumn, "price"> => c !== "price",
);
export type StatColumn = (typeof ALL_STAT_COLUMNS)[number];

export type PeerState =
  | { kind: "loading" }
  | { kind: "loaded"; fundamentals: CompanyFundamentals }
  | { kind: "failed"; code: string; message: string };

export interface CompsPeer {
  ticker: string;
  origin: "suggested" | "added";
  reason: string; // the screening reason, or "Added by you"
  state: PeerState;
}

export interface CompsRow {
  ticker: string;
  role: "target" | "peer";
  origin?: CompsPeer["origin"];
  reason?: string;
  state: PeerState["kind"];
  failure?: { code: string; message: string };
  fundamentals?: CompanyFundamentals;
  valuation?: Valuation;
  cells?: Record<CompsColumn, Metric>;
  needsPrice?: string[];
  lag?: MetricWarning; // W_PERIOD_LAG
}

export interface CompsTable {
  kind: IssuerKind; // the target's kind; decides the columns
  columns: readonly CompsColumn[];
  target: CompsRow;
  peers: CompsRow[];
  stats: Record<StatColumn, MetricStats>;
  lag: { peerMedianLtmEnd: string | null };
  counts: { peers: number; loaded: number; loading: number; failed: number };
}

function priceCell(v: Valuation): Metric {
  if (v.price) return v.price;
  // Several classes: each has its own price in the row; P/E is Unsupported.
  if (v.shareClasses.length > 1)
    return {
      status: "missing",
      reason: "one price per share class",
      warnings: [],
    };
  return { status: "missing", reason: "needs price", warnings: [] };
}

function pricedRow(
  f: CompanyFundamentals,
  quotes: readonly QuoteSnapshot[],
  analysisDate: string,
): Pick<CompsRow, "fundamentals" | "valuation" | "cells" | "needsPrice"> {
  const v = priceCompany(f, quotes, analysisDate);
  const m = v.multiples;
  return {
    fundamentals: f,
    valuation: v,
    needsPrice: v.needsPrice,
    cells: {
      price: priceCell(v),
      marketCap: v.bridge.marketCap,
      ev: v.bridge.enterpriseValue,
      revenue: f.metrics.revenue,
      ebitda: f.metrics.ebitda,
      ebitdaMargin: f.metrics.ebitdaMargin,
      evRevenue: m.evRevenue,
      evEbitda: m.evEbitda,
      pe: m.pe,
      digitalAssets:
        f.digital?.digitalAssets.metric ??
        notApplicable("digital-asset companies"),
      mcapToDigitalAssets:
        m.mcapToDigitalAssets ?? notApplicable("digital-asset companies"),
      commonEquity: f.bank?.commonEquity.metric ?? notApplicable("banks"),
      tangibleCommonEquity:
        f.bank?.tangibleCommonEquity.metric ?? notApplicable("banks"),
      rotce: f.bank?.rotce ?? notApplicable("banks"),
      priceToBook: m.priceToBook ?? notApplicable("banks"),
      priceToTangibleBook: m.priceToTangibleBook ?? notApplicable("banks"),
    },
  };
}

// §13B: a column another kind has no value for (a peer added by hand).
function notApplicable(only: string): Metric {
  return {
    status: "unsupported",
    reason: {
      code: "NOT_APPLICABLE",
      message: `not applicable: only computed for ${only}`,
    },
    warnings: [],
  };
}

// Dates as day numbers (days since 1970-01-01) so a median can fall between days.
const EPOCH = "1970-01-01";
const dayNumber = (iso: string) => daysBetween(EPOCH, iso);

function medianDay(days: number[]): number | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function lagWarning(
  ltmEnd: string,
  median: number,
  medianIso: string,
): MetricWarning | undefined {
  const gap = Math.abs(dayNumber(ltmEnd) - median);
  if (gap <= LAG_FLAG_DAYS) return undefined;
  return {
    code: "W_PERIOD_LAG",
    severity: "caution",
    message: `LTM ends ${ltmEnd}, ${gap} days from the peer median (${medianIso}); more than ${LAG_FLAG_DAYS} days`,
  };
}

export function buildComps(
  target: CompanyFundamentals,
  peers: readonly CompsPeer[],
  quotes: readonly QuoteSnapshot[],
  analysisDate: string,
): CompsTable {
  const targetRow: CompsRow = {
    ticker: target.identity.ticker,
    role: "target",
    state: "loaded",
    ...pricedRow(target, quotes, analysisDate),
  };
  const peerRows: CompsRow[] = peers.map((p) => {
    const base = {
      ticker: p.ticker,
      role: "peer" as const,
      origin: p.origin,
      reason: p.reason,
    };
    if (p.state.kind === "loading") return { ...base, state: "loading" };
    if (p.state.kind === "failed")
      return {
        ...base,
        state: "failed",
        failure: { code: p.state.code, message: p.state.message },
      };
    return {
      ...base,
      state: "loaded",
      ...pricedRow(p.state.fundamentals, quotes, analysisDate),
    };
  });

  const loadedPeers = peerRows.filter((r) => r.fundamentals);
  const median = medianDay(
    loadedPeers.map((r) => dayNumber(r.fundamentals!.ltmEnd)),
  );
  const medianIso = median === null ? null : addDays(EPOCH, Math.floor(median));
  if (median !== null && medianIso !== null)
    for (const row of [targetRow, ...loadedPeers]) {
      const lag = lagWarning(row.fundamentals!.ltmEnd, median, medianIso);
      if (lag) row.lag = lag;
    }

  const stats = Object.fromEntries(
    ALL_STAT_COLUMNS.map((col) => {
      const entries: StatEntry[] = peerRows.flatMap((r): StatEntry[] => {
        if (r.cells)
          return [
            {
              ticker: r.ticker,
              input: { kind: "metric", metric: r.cells[col] },
            },
          ];
        if (r.failure)
          return [
            {
              ticker: r.ticker,
              input: { kind: "failed", reason: r.failure.message },
            },
          ];
        return []; // still loading: not counted yet
      });
      return [col, summarize(entries)];
    }),
  ) as Record<StatColumn, MetricStats>;

  const kind = target.kind ?? "operating";
  return {
    kind,
    columns: columnsForKind(kind),
    target: targetRow,
    peers: peerRows,
    stats,
    lag: { peerMedianLtmEnd: medianIso },
    counts: {
      peers: peerRows.length,
      loaded: loadedPeers.length,
      loading: peerRows.filter((r) => r.state === "loading").length,
      failed: peerRows.filter((r) => r.state === "failed").length,
    },
  };
}
