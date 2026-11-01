// The export snapshot (blueprint §11, §13): one computed comps state that the
// workbook renders, built with the same domain code the browser runs (buildComps,
// impliedValuationOf), so the workbook and the screen can't disagree (CLAUDE.md
// invariant 3). Pure: the caller loads fundamentals and supplies the clock.
//
// Rows are the CompsRow the screen renders rather than blueprint §11's
// ComparableCompany: the same content, already in use since M4b (ADR 0010).

import {
  buildComps,
  COMPS_COLUMNS,
  type CompsColumn,
  type CompsPeer,
  type CompsRow,
  type CompsTable,
} from "@/domain/comps";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import {
  impliedValuationOf,
  type ImpliedMultiple,
  type ImpliedResult,
} from "@/domain/impliedValuation";
import { NM_REASON_TEXT } from "@/domain/nm";
import { METHODOLOGY_VERSION } from "@/domain/policy";
import type {
  Metric,
  PeerSelectionResult,
  QuoteSnapshot,
} from "@/domain/types";

// A table cell that is not a number, and why: the "what's missing" note (blueprint §6).
export interface NotANumber {
  ticker: string;
  column: CompsColumn;
  status: "nm" | "missing" | "unsupported";
  reason: string;
}

export interface SnapshotWarning {
  ticker: string;
  code: string;
  severity: "info" | "caution";
  message: string;
}

export interface ExportSnapshot {
  appVersion: string;
  methodologyVersion: string;
  generatedAt: string; // ISO timestamp
  analysisDate: string;
  priceDate: string | null; // earliest quote date; null without prices
  table: CompsTable;
  implied: Record<ImpliedMultiple, ImpliedResult>;
  peerSelection: PeerSelectionResult | null; // null when screening failed
  peerSelectionError?: string;
  quotes: QuoteSnapshot[];
  missing: NotANumber[];
  warnings: SnapshotWarning[];
}

export function metricReason(m: Metric): string {
  switch (m.status) {
    case "nm":
      return NM_REASON_TEXT[m.reason];
    case "missing":
      return m.reason;
    case "unsupported":
      return m.reason.message;
    default:
      return "";
  }
}

const loadedRows = (t: CompsTable): CompsRow[] =>
  [t.target, ...t.peers].filter((r) => r.cells);

function missingCells(t: CompsTable): NotANumber[] {
  return loadedRows(t).flatMap((r) =>
    COMPS_COLUMNS.flatMap((column): NotANumber[] => {
      const m = r.cells![column];
      return m.status === "reported" || m.status === "derived"
        ? []
        : [
            {
              ticker: r.ticker,
              column,
              status: m.status,
              reason: metricReason(m),
            },
          ];
    }),
  );
}

// Every warning on a row's metrics, its EV bridge, its lag flag and the company
// itself, once per (ticker, code, message).
function rowWarnings(r: CompsRow): SnapshotWarning[] {
  const f = r.fundamentals!;
  const b = r.valuation!.bridge;
  const metrics: Metric[] = [
    ...Object.values(f.metrics),
    ...Object.values(r.cells!),
    b.totalDebt,
    b.cashAndInvestments,
  ];
  const out: SnapshotWarning[] = [];
  const seen = new Set<string>();
  const add = (w: Omit<SnapshotWarning, "ticker">) => {
    const k = `${w.code}\u0000${w.message}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ticker: r.ticker, ...w });
  };
  // Adapter warnings carry no severity; a parsed filing is information (as in ltm.ts),
  // a missing filing or cover page is a caution.
  for (const w of f.warnings)
    add({
      code: w.code,
      message: w.message,
      severity: w.code === "W_FILING_PARSED" ? "info" : "caution",
    });
  for (const m of metrics) for (const w of m.warnings) add(w);
  if (r.lag) add(r.lag);
  return out;
}

export function buildExportSnapshot(input: {
  target: CompanyFundamentals;
  peers: readonly CompsPeer[];
  quotes: readonly QuoteSnapshot[];
  analysisDate: string;
  generatedAt: string;
  appVersion: string;
  peerSelection: PeerSelectionResult | null;
  peerSelectionError?: string;
}): ExportSnapshot {
  const table = buildComps(
    input.target,
    input.peers,
    input.quotes,
    input.analysisDate,
  );
  const dates = input.quotes.map((q) => q.asOfDate).sort();
  return {
    appVersion: input.appVersion,
    methodologyVersion: METHODOLOGY_VERSION,
    generatedAt: input.generatedAt,
    analysisDate: input.analysisDate,
    priceDate: dates[0] ?? null,
    table,
    implied: impliedValuationOf(table),
    peerSelection: input.peerSelection,
    ...(input.peerSelectionError
      ? { peerSelectionError: input.peerSelectionError }
      : {}),
    quotes: [...input.quotes],
    missing: missingCells(table),
    warnings: loadedRows(table).flatMap(rowWarnings),
  };
}
