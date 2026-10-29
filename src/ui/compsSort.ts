// Sorting the comps table's peer rows (blueprint §6). Stable; the target row and the
// statistics rows are never part of a sort. Rows without a usable value (NM, "—",
// Unsupported, still loading, failed) go last in either direction, in their original
// order, so a sort never reads them as numbers.

import type { CompsColumn, CompsRow } from "@/domain/comps";

export type SortColumn = CompsColumn | "company" | "ticker" | "finThrough";
export type SortState = {
  column: SortColumn;
  direction: "ascending" | "descending";
} | null;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function key(row: CompsRow, column: SortColumn): number | string | null {
  if (column === "ticker") return row.ticker;
  if (column === "company") return row.fundamentals?.identity.name ?? null;
  if (column === "finThrough") return row.fundamentals?.ltmEnd ?? null;
  const m = row.cells?.[column];
  return m && (m.status === "reported" || m.status === "derived")
    ? m.value
    : null;
}

export function sortPeerRows(rows: readonly CompsRow[], sort: SortState) {
  if (!sort) return [...rows];
  const sign = sort.direction === "ascending" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, k: key(row, sort.column) }))
    .sort((a, b) => {
      if (a.k === null || b.k === null)
        return a.k === null && b.k === null ? a.i - b.i : a.k === null ? 1 : -1;
      const c =
        typeof a.k === "number" && typeof b.k === "number"
          ? a.k - b.k
          : byText(String(a.k), String(b.k));
      return c * sign || a.i - b.i;
    })
    .map((x) => x.row);
}
