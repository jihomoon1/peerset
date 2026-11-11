// The slide table (blueprint §17, "Slide table"): ExportSnapshot → a one-sheet
// workbook holding only the comps table, for pasting into a slide, and under it the
// sources to cite. Pure: no clock, no I/O.
//
// Same snapshot as the full workbook, so the numbers are the screen's. Cells are plain
// values, not formulas: there is no Calculations sheet here for a formula to point at.
// NM, "—" and Unsupported stay text, never 0. Money is in USD millions at full
// precision; the number format does the rounding.

import ExcelJS from "exceljs";
import type { CompsColumn, CompsRow, StatColumn } from "@/domain/comps";
import type { Metric } from "@/domain/types";
import { formatDate } from "@/lib/format";
import { DISCLAIMER } from "@/lib/site";
import {
  SLIDE_COLUMN_LABEL,
  SLIDE_STAT_LABEL,
  normalizeSlideOptions,
  type SlideOptions,
} from "./options";
import { text } from "./sanitize";
import type { ExportSnapshot } from "./snapshot";
import { COLOR, NUM_FMT, type NumFmt } from "./styles";
import { priceHeader } from "./workbook";

export const SLIDE_SHEET_NAME = "Comps";
export const SLIDE_HEADER_ROW = 4;
export const SLIDE_TARGET_ROW = 5;

const MILLION = 1_000_000;
const MONEY: readonly CompsColumn[] = [
  "marketCap",
  "ev",
  "revenue",
  "ebitda",
  "digitalAssets",
  "commonEquity",
  "tangibleCommonEquity",
];
const FMT: Record<CompsColumn, NumFmt> = {
  price: "perShare",
  marketCap: "millions",
  ev: "millions",
  revenue: "millions",
  ebitda: "millions",
  ebitdaMargin: "percent",
  evRevenue: "multiple",
  evEbitda: "multiple",
  pe: "multiple",
  digitalAssets: "millions",
  mcapToDigitalAssets: "multiple",
  commonEquity: "millions",
  tangibleCommonEquity: "millions",
  rotce: "percent",
  priceToBook: "multiple",
  priceToTangibleBook: "multiple",
};
const STATUS_TEXT = {
  nm: "NM",
  missing: "—",
  unsupported: "Unsupported",
} as const;

const BLACK = { argb: COLOR.formula };
const base = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
  name: "Calibri",
  size: 11,
  color: BLACK,
  ...extra,
});
const rule = (style: "thin" | "medium"): Partial<ExcelJS.Border> => ({
  style,
  color: BLACK,
});

function putText(
  cell: ExcelJS.Cell,
  s: string,
  extra: Partial<ExcelJS.Font> = {},
) {
  cell.value = text(s);
  cell.font = base(extra);
}

function putNumber(
  cell: ExcelJS.Cell,
  col: CompsColumn,
  value: number,
  extra: Partial<ExcelJS.Font> = {},
) {
  if (!Number.isFinite(value))
    throw new RangeError(`not a finite value for ${col}: ${value}`);
  const n = MONEY.includes(col) ? value / MILLION : value;
  cell.value = n;
  // Millions too small for one decimal get three, so they never read as 0.0.
  cell.numFmt =
    FMT[col] === "millions" && n !== 0 && Math.abs(n) < 0.05
      ? NUM_FMT.smallMillions
      : NUM_FMT[FMT[col]];
  cell.font = base(extra);
  cell.alignment = { horizontal: "right" };
}

function putPlaceholder(cell: ExcelJS.Cell, s: string) {
  cell.value = s;
  cell.font = base({ color: { argb: COLOR.muted } });
  cell.alignment = { horizontal: "right" };
}

const usable = (m: Metric): m is Extract<Metric, { value: number }> =>
  m.status === "reported" || m.status === "derived";

// "Lennox International Inc (LII): Form 10-Q for the period ended June 30, 2026,
// filed July 22, 2026"
function filingLine(r: CompsRow): string {
  const id = r.fundamentals!.identity;
  const f = id.latestPeriodic;
  return f
    ? `${id.name} (${r.ticker}): Form ${f.form} for the period ended ${formatDate(f.reportDate)}, filed ${formatDate(f.filedDate)}`
    : `${id.name} (${r.ticker})`;
}

export function buildSlideWorkbook(
  s: ExportSnapshot,
  options: SlideOptions,
): ExcelJS.Workbook {
  const { columns, stats } = normalizeSlideOptions(options);
  if (columns.length === 0)
    throw new RangeError("the slide table needs at least one column");

  const wb = new ExcelJS.Workbook();
  wb.creator = "PeerSet";
  wb.created = new Date(s.generatedAt);
  wb.modified = new Date(s.generatedAt);
  const ws = wb.addWorksheet(SLIDE_SHEET_NAME);
  ws.views = [{ showGridLines: false }];
  ws.columns = [
    { width: 36 },
    { width: 9 },
    ...columns.map(() => ({ width: 14 })),
  ];
  const width = 2 + columns.length;
  const colOf = (c: CompsColumn) => 3 + columns.indexOf(c);

  const { table } = s;
  const target = table.target.fundamentals!.identity;
  putText(
    ws.getCell("A1"),
    `${target.name} (${target.ticker}): trading comparables`,
    { bold: true, size: 14 },
  );
  putText(
    ws.getCell("A2"),
    "USD in millions, except per-share data. LTM = last twelve months.",
    { italic: true },
  );

  // Header: one rule under it.
  const head = ws.getRow(SLIDE_HEADER_ROW);
  putText(head.getCell(1), "Company", { bold: true });
  putText(head.getCell(2), "Ticker", { bold: true });
  for (const c of columns) {
    const cell = head.getCell(colOf(c));
    putText(cell, SLIDE_COLUMN_LABEL[c], { bold: true });
    cell.alignment = { horizontal: "right", wrapText: true };
  }
  for (let c = 1; c <= width; c++)
    head.getCell(c).border = { bottom: rule("medium") };

  // The target (bold), then every peer that loaded.
  const rows = [table.target, ...table.peers].filter((r) => r.cells);
  let n = SLIDE_TARGET_ROW;
  for (const r of rows) {
    const row = ws.getRow(n++);
    const bold = r.role === "target" ? { bold: true } : {};
    putText(row.getCell(1), r.fundamentals!.identity.name, bold);
    putText(row.getCell(2), r.ticker, bold);
    for (const c of columns) {
      const m = r.cells![c];
      if (usable(m)) putNumber(row.getCell(colOf(c)), c, m.value, bold);
      else putPlaceholder(row.getCell(colOf(c)), STATUS_TEXT[m.status]);
    }
  }

  // Summary rows over peers only, from the same statistics the screen shows.
  if (stats.length > 0) {
    for (let c = 1; c <= width; c++)
      ws.getRow(n).getCell(c).border = { top: rule("thin") };
    for (const stat of stats) {
      const row = ws.getRow(n++);
      putText(row.getCell(1), `Peer ${SLIDE_STAT_LABEL[stat].toLowerCase()}`, {
        bold: true,
      });
      for (const c of columns) {
        if (c === "price") continue; // an average share price means nothing
        const v = table.stats[c as StatColumn][stat];
        if (v === null) putPlaceholder(row.getCell(colOf(c)), "—");
        else putNumber(row.getCell(colOf(c)), c, v, { bold: true });
      }
    }
  }

  // Sources, ready to copy into a slide footer.
  n += 1;
  const note = (line: string, extra: Partial<ExcelJS.Font> = {}) =>
    putText(ws.getCell(n++, 1), line, { size: 9, ...extra });
  note("Sources", { bold: true });
  note(
    `Source: company SEC filings (Forms 10-K and 10-Q), compiled with PeerSet (methodology ${s.methodologyVersion}).`,
  );
  note(priceHeader(s.quotes, s.priceDate));
  note(
    "EBITDA is standardized and unadjusted (operating income + D&A). Equity value uses basic shares from the filing cover.",
  );
  note(DISCLAIMER);
  n += 1;
  note("Latest filing by company", { bold: true });
  for (const r of rows) {
    const cell = ws.getCell(n++, 1);
    const url = r.fundamentals!.identity.latestPeriodic?.indexUrl;
    putText(cell, filingLine(r), { size: 9 });
    if (url && /^https:\/\/www\.sec\.gov\/[A-Za-z0-9/._-]+$/.test(url))
      cell.value = { text: text(filingLine(r)), hyperlink: url };
  }
  const failed = table.peers.filter((r) => !r.cells).map((r) => r.ticker);
  if (failed.length > 0)
    note(`Not shown (failed to load): ${failed.join(", ")}`);

  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  return wb;
}
