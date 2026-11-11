// The Export button's request and state (blueprint §6, §13). Pure, so it is tested
// without a browser. The request carries only inputs: the target, the added and
// removed peers and the prices the screen applied (with their date). The server
// recomputes every number from those.

import type { CompsColumn, CompsTable } from "@/domain/comps";
import type { QuoteSnapshot } from "@/domain/types";
import type { ExportOptions } from "@/export/options";

export interface ExportRequestBody {
  target: string;
  add: string[];
  remove: string[];
  prices: Record<string, number>;
  priceDate?: string;
  // v1.1: prices the browser filled from Alpha Vantage with the user's own key, each
  // with its bar's date. Still user inputs; the server labels them, never trusts more.
  filled?: Record<string, string>;
  // What the workbook should contain; absent means the full three-sheet workbook.
  options?: ExportOptions;
}

export interface ExportState {
  request: ExportRequestBody;
  disabledReason: string | null; // null = the button is enabled
  notANumber: number; // cells the workbook will show as NM, — or Unsupported
  columns: readonly CompsColumn[]; // the table's columns (methodology §13B)
}

const usable = (status: string) =>
  status === "reported" || status === "derived";

export function exportState(input: {
  target: string;
  added: string[];
  removed: string[];
  table: CompsTable;
  quotes: readonly QuoteSnapshot[]; // the quotes the table was priced with
  priceDate: string;
  dateError?: string;
}): ExportState {
  const { table } = input;
  const prices = Object.fromEntries(
    input.quotes.map((q) => [q.symbol, q.close]),
  );
  const filled = Object.fromEntries(
    input.quotes
      .filter((q) => q.source === "alpha_vantage_user_key")
      .map((q) => [q.symbol, q.asOfDate]),
  );
  const rows = [table.target, ...table.peers].filter((r) => r.cells);
  const cells = rows.flatMap((r) =>
    table.columns.map((c) => r.cells![c].status),
  );
  const disabledReason =
    table.counts.loading > 0
      ? "Wait until every peer has finished loading"
      : input.dateError
        ? "Fix the price date first"
        : cells.some(usable)
          ? null
          : "Nothing to export yet: no row has a value";
  return {
    request: {
      target: input.target,
      add: [...input.added],
      remove: [...input.removed],
      prices,
      ...(input.quotes.length > 0 ? { priceDate: input.priceDate } : {}),
      ...(Object.keys(filled).length > 0 ? { filled } : {}),
    },
    disabledReason,
    notANumber: cells.filter((s) => !usable(s)).length,
    columns: table.columns,
  };
}
