// The Export button's request and state (blueprint §6, §13). Pure, so it is tested
// without a browser. The request carries only inputs: the target, the added and
// removed peers and the prices the screen applied (with their date). The server
// recomputes every number from those.

import { COMPS_COLUMNS, type CompsTable } from "@/domain/comps";
import type { QuoteSnapshot } from "@/domain/types";

export interface ExportRequestBody {
  target: string;
  add: string[];
  remove: string[];
  prices: Record<string, number>;
  priceDate?: string;
}

export interface ExportState {
  request: ExportRequestBody;
  disabledReason: string | null; // null = the button is enabled
  notANumber: number; // cells the workbook will show as NM, — or Unsupported
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
  const rows = [table.target, ...table.peers].filter((r) => r.cells);
  const cells = rows.flatMap((r) =>
    COMPS_COLUMNS.map((c) => r.cells![c].status),
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
    },
    disabledReason,
    notANumber: cells.filter((s) => !usable(s)).length,
  };
}
