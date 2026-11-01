// The export workbook (blueprint §17): ExportSnapshot → a three-sheet ExcelJS
// workbook. Pure: no clock, no I/O; the route writes the buffer.
//
// - Trading Comps: header block, the target and peer rows, statistics as formulas over
//   the peer rows only, the implied valuation, notes.
// - Calculations: one block per company with every hardcoded input (blue): the LTM
//   bridges, capitalization by share class, debt and cash lines, the EV bridge.
// - Sources & Methodology: one row per fact used, linked to its SEC filing index,
//   then definitions, policy, limitations and versions.
//
// A cell is a number or formula only when the domain value is Reported or Derived;
// NM, "—" and Unsupported are grey text (ADR 0010), which Excel's statistics skip, so
// the workbook's statistics use exactly the values stats.ts uses. Formulas carry the
// domain value as their cached result. Money is in USD millions at full precision.

import ExcelJS from "exceljs";
import {
  STAT_COLUMNS,
  type CompsColumn,
  type CompsRow,
  type StatColumn,
} from "@/domain/comps";
import { METRIC_KEYS, type MetricKey } from "@/domain/fundamentals";
import {
  IMPLIED_MULTIPLES,
  IMPLIED_POINTS,
  type ImpliedPoint,
} from "@/domain/impliedValuation";
import { NM_MULTIPLE_CAP } from "@/domain/policy";
import type {
  LTMCalculation,
  Metric,
  ReportedFinancialFact,
} from "@/domain/types";
import { DISCLAIMER } from "@/lib/site";
import { text } from "./sanitize";
import { metricReason, type ExportSnapshot } from "./snapshot";
import {
  COLOR,
  fill,
  font,
  NUM_FMT,
  ruleBelow,
  type NumFmt,
  type Role,
} from "./styles";

export const SHEET_NAMES = {
  comps: "Trading Comps",
  calc: "Calculations",
  sources: "Sources & Methodology",
} as const;

export const HEADER_ROW = 8;
export const TARGET_ROW = 9;
export const FIRST_PEER_ROW = 11;

type SheetKey = "company" | "ticker" | "ltmEnd" | CompsColumn;

export const COMPS_SHEET_COLUMNS: readonly {
  key: SheetKey;
  header: string;
  width: number;
  fmt?: NumFmt;
}[] = [
  { key: "company", header: "Company", width: 34 },
  { key: "ticker", header: "Ticker", width: 9 },
  { key: "ltmEnd", header: "Fin. through", width: 12, fmt: "date" },
  { key: "price", header: "Price", width: 10, fmt: "perShare" },
  { key: "marketCap", header: "Equity value", width: 13, fmt: "millions" },
  { key: "ev", header: "EV", width: 13, fmt: "millions" },
  { key: "revenue", header: "LTM revenue", width: 13, fmt: "millions" },
  { key: "ebitda", header: "LTM EBITDA", width: 13, fmt: "millions" },
  { key: "ebitdaMargin", header: "EBITDA margin", width: 11, fmt: "percent" },
  { key: "evRevenue", header: "EV/Revenue", width: 11, fmt: "multiple" },
  { key: "evEbitda", header: "EV/EBITDA", width: 11, fmt: "multiple" },
  { key: "pe", header: "P/E", width: 9, fmt: "multiple" },
];

const MILLION = 1_000_000;
const MONEY_COLUMNS: readonly CompsColumn[] = [
  "marketCap",
  "ev",
  "revenue",
  "ebitda",
];

const METRIC_LABEL: Record<MetricKey, string> = {
  revenue: "Revenue",
  operatingIncome: "Operating income",
  da: "D&A",
  ebitda: "EBITDA (standardized, unadjusted)",
  ebitdaMargin: "EBITDA margin",
  netIncome: "Net income",
  dilutedEps: "Diluted EPS",
};

const COLUMN_LABEL: Record<CompsColumn, string> = {
  price: "price",
  marketCap: "equity value",
  ev: "EV",
  revenue: "LTM revenue",
  ebitda: "LTM EBITDA",
  ebitdaMargin: "EBITDA margin",
  evRevenue: "EV/Revenue",
  evEbitda: "EV/EBITDA",
  pe: "P/E",
};

const STATUS_TEXT = {
  nm: "NM",
  missing: "—",
  unsupported: "Unsupported",
} as const;

type Usable = Extract<Metric, { value: number }>;
const usable = (m: Metric): m is Usable =>
  m.status === "reported" || m.status === "derived";

export function colLetter(n: number): string {
  let s = "";
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26))
    s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

const colOf = (key: SheetKey) =>
  COMPS_SHEET_COLUMNS.findIndex((c) => c.key === key) + 1;
const letterOf = (key: SheetKey) => colLetter(colOf(key));

const isoDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ── Cell writers: every text through text(), every number with its format ────────

function putText(
  cell: ExcelJS.Cell,
  s: string,
  extra: Partial<ExcelJS.Font> = {},
) {
  cell.value = text(s);
  cell.font = font("formula", extra);
}

function putMuted(cell: ExcelJS.Cell, s: string) {
  cell.value = text(s);
  cell.font = font("muted");
}

// NM, "—" or Unsupported: grey, right-aligned text with the reason as a note.
function putStatus(cell: ExcelJS.Cell, m: Metric) {
  const status = m.status as keyof typeof STATUS_TEXT;
  cell.value = STATUS_TEXT[status];
  cell.font = font("muted");
  cell.alignment = { horizontal: "right" };
  const reason = metricReason(m);
  if (reason) cell.note = reason;
}

function putDash(cell: ExcelJS.Cell, note?: string) {
  cell.value = "—";
  cell.font = font("muted");
  cell.alignment = { horizontal: "right" };
  if (note) cell.note = note;
}

function putInput(cell: ExcelJS.Cell, n: number, fmt: NumFmt) {
  if (!Number.isFinite(n)) throw new RangeError(`not a finite input: ${n}`);
  cell.value = n;
  cell.numFmt = NUM_FMT[fmt];
  cell.font = font("input");
}

function putFormula(
  cell: ExcelJS.Cell,
  formula: string,
  result: number,
  fmt: NumFmt,
  role: Role = "formula",
) {
  if (!Number.isFinite(result))
    throw new RangeError(`not a finite result for ${formula}`);
  cell.value = { formula, result };
  cell.numFmt = NUM_FMT[fmt];
  cell.font = font(role);
}

function headerRow(row: ExcelJS.Row, labels: (string | null)[], from = 1) {
  labels.forEach((l, i) => {
    if (l === null) return;
    const c = row.getCell(from + i);
    putText(c, l, { bold: true });
    c.border = ruleBelow;
  });
}

// ── Calculations ─────────────────────────────────────────────────────────────

// Where a company's numbers sit on Calculations; present only for numeric cells.
interface CompanyRefs {
  price?: string;
  marketCap?: string;
  ev?: string;
  revenue?: string;
  ebitda?: string;
  pe?: string;
  totalDebt?: string;
  cash?: string;
  shares?: string;
}

const CALC_WIDTHS = [44, 14, 14, 14, 14, 52, 60];

class Cursor {
  constructor(
    readonly ws: ExcelJS.Worksheet,
    public r = 1,
  ) {}
  row(): ExcelJS.Row {
    return this.ws.getRow(this.r++);
  }
  skip(n = 1) {
    this.r += n;
  }
}

function periodText(f: ReportedFinancialFact | undefined, label: string) {
  return f ? `${label} ${f.period.start ?? ""}–${f.period.end}` : "";
}

// One LTM bridge row: FY | + YTD | − prior YTD | = LTM, inputs in blue.
function ltmRow(
  cur: Cursor,
  label: string,
  m: Metric,
  calc: LTMCalculation | undefined,
  perShare: boolean,
): string | undefined {
  const row = cur.row();
  const r = row.number;
  const scale = perShare ? 1 : MILLION;
  const fmt: NumFmt = perShare ? "perShare" : "millions";
  putText(row.getCell(1), label);
  if (!usable(m)) {
    putStatus(row.getCell(5), m);
    putMuted(row.getCell(6), metricReason(m));
    return undefined;
  }
  if (calc) {
    putInput(row.getCell(2), calc.fy.value / scale, fmt);
    if (
      calc.method === "fy_plus_ytd_minus_prior_ytd" &&
      calc.ytdCurrent &&
      calc.ytdPrior
    ) {
      putInput(row.getCell(3), calc.ytdCurrent.value / scale, fmt);
      putInput(row.getCell(4), calc.ytdPrior.value / scale, fmt);
      putFormula(row.getCell(5), `B${r}+C${r}-D${r}`, m.value / scale, fmt);
    } else putFormula(row.getCell(5), `B${r}`, m.value / scale, fmt);
    putMuted(row.getCell(6), calc.concept);
    putMuted(
      row.getCell(7),
      [
        periodText(calc.fy, "FY"),
        periodText(calc.ytdCurrent, "YTD"),
        periodText(calc.ytdPrior, "prior YTD"),
      ]
        .filter(Boolean)
        .join("; "),
    );
  } else putInput(row.getCell(5), m.value / scale, fmt);
  return `E${r}`;
}

// A total as a SUM of its numeric parts when they add up to the domain value (to the
// cent); otherwise the domain value as an input with a note, never a wrong formula.
function putTotal(
  cell: ExcelJS.Cell,
  m: Usable,
  parts: { ref: string; value: number }[],
  note?: string,
) {
  const sum = parts.reduce((s, p) => s + p.value, 0);
  if (parts.length > 0 && Math.abs(sum - m.value) < 0.005)
    putFormula(
      cell,
      parts.length === 1
        ? parts[0].ref
        : `SUM(${parts.map((p) => p.ref).join(",")})`,
      m.value / MILLION,
      "millions",
    );
  else {
    putInput(cell, m.value / MILLION, "millions");
    cell.note =
      note ??
      (parts.length === 0
        ? "Reported 0: no amount on the balance-sheet face"
        : "Total as computed by PeerSet; see the lines above");
  }
}

const memberLabel = (member: string) =>
  member === "single"
    ? "Common stock"
    : member
        .replace(/^.*:/, "")
        .replace(/Member$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2");

function companyBlock(cur: Cursor, r: CompsRow): CompanyRefs {
  const f = r.fundamentals!;
  const v = r.valuation!;
  const refs: CompanyRefs = {};
  const id = f.identity;

  const title = cur.row();
  putText(
    title.getCell(1),
    `${id.name} (${id.ticker})${r.role === "target" ? " — target" : ""}`,
    {
      bold: true,
      size: 12,
    },
  );
  if (r.role === "target")
    for (let c = 1; c <= 7; c++) title.getCell(c).fill = fill(COLOR.targetFill);
  const lp = id.latestPeriodic;
  putMuted(
    cur.row().getCell(1),
    `CIK ${id.cik} · LTM through ${f.ltmEnd}` +
      (lp
        ? ` · latest ${lp.form} filed ${lp.filedDate} (${lp.accession})`
        : "") +
      ` · balance sheet ${f.balanceSheet.date}`,
  );
  cur.skip();

  // LTM bridges
  headerRow(cur.row(), [
    "LTM bridge (USD m; EPS in USD)",
    "FY",
    "+ YTD",
    "− prior YTD",
    "= LTM",
    "Concept",
    "Periods",
  ]);
  const at: Partial<Record<MetricKey, string>> = {};
  for (const key of ["revenue", "operatingIncome"] as const)
    at[key] = ltmRow(
      cur,
      METRIC_LABEL[key],
      f.metrics[key],
      f.ltmDetail[key],
      false,
    );

  const daParts = Object.keys(f.ltmDetail).filter((k) => k.startsWith("da:"));
  if (!f.ltmDetail.da && daParts.length > 0 && usable(f.metrics.da)) {
    const partRefs = daParts.map((k) => {
      const calc = f.ltmDetail[k];
      const m: Metric = {
        ...(f.metrics.da as Usable),
        value: calc.value ?? NaN,
      };
      return ltmRow(cur, `D&A part: ${calc.concept}`, m, calc, false);
    });
    const row = cur.row();
    putText(row.getCell(1), METRIC_LABEL.da);
    putFormula(
      row.getCell(5),
      partRefs.join("+"),
      f.metrics.da.value / MILLION,
      "millions",
    );
    at.da = `E${row.number}`;
  } else
    at.da = ltmRow(cur, METRIC_LABEL.da, f.metrics.da, f.ltmDetail.da, false);

  {
    const row = cur.row();
    putText(row.getCell(1), METRIC_LABEL.ebitda + " = operating income + D&A", {
      bold: true,
    });
    const m = f.metrics.ebitda;
    if (usable(m) && at.operatingIncome && at.da) {
      putFormula(
        row.getCell(5),
        `${at.operatingIncome}+${at.da}`,
        m.value / MILLION,
        "millions",
      );
      at.ebitda = `E${row.number}`;
    } else putStatus(row.getCell(5), m);
  }
  {
    const row = cur.row();
    putText(row.getCell(1), "EBITDA margin = EBITDA ÷ revenue");
    const m = f.metrics.ebitdaMargin;
    if (usable(m) && at.ebitda && at.revenue)
      putFormula(
        row.getCell(5),
        `${at.ebitda}/${at.revenue}`,
        m.value,
        "percent",
      );
    else putStatus(row.getCell(5), m);
  }
  at.netIncome = ltmRow(
    cur,
    METRIC_LABEL.netIncome,
    f.metrics.netIncome,
    f.ltmDetail.netIncome,
    false,
  );
  at.dilutedEps = ltmRow(
    cur,
    METRIC_LABEL.dilutedEps,
    f.metrics.dilutedEps,
    f.ltmDetail.dilutedEps,
    true,
  );
  refs.revenue = at.revenue;
  refs.ebitda = at.ebitda;
  cur.skip();

  // Capitalization by share class
  headerRow(cur.row(), [
    "Capitalization (cover-page shares, basic)",
    "Ticker",
    "Shares (m)",
    "Price",
    "Equity value",
    "Shares as of",
  ]);
  const classParts: { ref: string; value: number }[] = [];
  for (const c of v.shareClasses) {
    const row = cur.row();
    const n = row.number;
    putText(row.getCell(1), memberLabel(c.classMember));
    putText(row.getCell(2), c.ticker ?? "unlisted");
    putInput(row.getCell(3), c.shares / MILLION, "shares");
    if (c.quote) putInput(row.getCell(4), c.quote.close, "perShare");
    else putDash(row.getCell(4), "needs price");
    if (usable(c.equityValue) && c.quote) {
      putFormula(
        row.getCell(5),
        `C${n}*D${n}`,
        c.equityValue.value / MILLION,
        "millions",
      );
      classParts.push({ ref: `E${n}`, value: c.equityValue.value });
    } else putStatus(row.getCell(5), c.equityValue);
    putMuted(
      row.getCell(6),
      `${c.sharesAsOf} (cover, ${c.coverFiling.accession})`,
    );
    if (v.shareClasses.length === 1) {
      refs.shares = `C${n}`;
      if (c.quote) refs.price = `D${n}`;
    }
  }
  {
    const row = cur.row();
    putText(row.getCell(1), "Market cap (equity value)", { bold: true });
    const m = v.bridge.marketCap;
    if (usable(m)) {
      putTotal(row.getCell(5), m, classParts);
      refs.marketCap = `E${row.number}`;
    } else putStatus(row.getCell(5), m);
  }
  cur.skip();

  // Debt and cash lines from the balance-sheet face
  const lines = (
    title: string,
    items: typeof v.bridge.debtLines,
    total: Metric,
    totalLabel: string,
  ): string | undefined => {
    headerRow(cur.row(), [
      title,
      null,
      "Value",
      "Treatment",
      null,
      "Concept",
      "Reason",
    ]);
    const parts: { ref: string; value: number }[] = [];
    for (const l of items) {
      const row = cur.row();
      putText(row.getCell(1), l.label);
      if (l.value === null)
        putDash(row.getCell(3), "no consolidated fact at the date");
      else putInput(row.getCell(3), l.value / MILLION, "millions");
      putText(row.getCell(4), l.included ? "Included" : "Excluded");
      putMuted(row.getCell(6), l.concept);
      putMuted(row.getCell(7), l.why);
      if (l.included && l.value !== null)
        parts.push({ ref: `C${row.number}`, value: l.value });
    }
    const row = cur.row();
    putText(row.getCell(1), totalLabel, { bold: true });
    if (!usable(total)) {
      putStatus(row.getCell(5), total);
      return undefined;
    }
    putTotal(
      row.getCell(5),
      total,
      parts,
      total.warnings.find(
        (w) =>
          w.code === "W_NO_DEBT_LINES" || w.code === "W_DEBT_LINES_NO_AMOUNT",
      )?.message,
    );
    return `E${row.number}`;
  };
  const bsDate = f.balanceSheet.date;
  refs.totalDebt = lines(
    `Debt lines (balance sheet, ${bsDate}; USD m)`,
    v.bridge.debtLines,
    v.bridge.totalDebt,
    "Total debt",
  );
  cur.skip();
  refs.cash = lines(
    `Cash lines (balance sheet, ${bsDate}; USD m)`,
    v.bridge.cashLines,
    v.bridge.cashAndInvestments,
    "Cash and short-term investments",
  );
  cur.skip();

  // Not in EV, EV and P/E
  headerRow(cur.row(), ["Not in EV (methodology §9)", null, "Value"]);
  for (const item of v.bridge.notInEv) {
    const row = cur.row();
    putText(
      row.getCell(1),
      item.item === "preferred" ? "Preferred stock" : "Noncontrolling interest",
    );
    if (item.status === "reported" || item.status === "derived")
      putInput(row.getCell(3), item.value / MILLION, "millions");
    else
      putDash(
        row.getCell(3),
        item.status === "missing" ? "no such line" : item.status,
      );
  }
  cur.skip();
  {
    const row = cur.row();
    putText(
      row.getCell(1),
      "Enterprise value = market cap + total debt − cash",
      { bold: true },
    );
    const m = v.bridge.enterpriseValue;
    if (usable(m) && refs.marketCap && refs.totalDebt && refs.cash) {
      putFormula(
        row.getCell(5),
        `${refs.marketCap}+${refs.totalDebt}-${refs.cash}`,
        m.value / MILLION,
        "millions",
      );
      refs.ev = `E${row.number}`;
    } else putStatus(row.getCell(5), m);
  }
  {
    const row = cur.row();
    putText(row.getCell(1), "P/E = price ÷ LTM diluted EPS");
    const m = r.cells!.pe;
    if (usable(m) && refs.price && at.dilutedEps) {
      putFormula(
        row.getCell(5),
        `${refs.price}/${at.dilutedEps}`,
        m.value,
        "multiple",
      );
      refs.pe = `E${row.number}`;
    } else putStatus(row.getCell(5), m);
  }
  cur.skip(2);
  return refs;
}

// ── Trading Comps ────────────────────────────────────────────────────────────

const LINKED: Partial<Record<CompsColumn, keyof CompanyRefs>> = {
  price: "price",
  marketCap: "marketCap",
  ev: "ev",
  revenue: "revenue",
  ebitda: "ebitda",
  pe: "pe",
};

function compsRow(
  ws: ExcelJS.Worksheet,
  n: number,
  r: CompsRow,
  refs: CompanyRefs,
) {
  const row = ws.getRow(n);
  const f = r.fundamentals!;
  putText(row.getCell(1), f.identity.name);
  putText(row.getCell(2), r.ticker);
  const d = row.getCell(3);
  d.value = isoDate(f.ltmEnd);
  d.numFmt = NUM_FMT.date;
  d.font = font("input");
  const L = (k: SheetKey) => `${letterOf(k)}${n}`;
  const same: Partial<Record<CompsColumn, string>> = {
    ebitdaMargin: `${L("ebitda")}/${L("revenue")}`,
    evRevenue: `${L("ev")}/${L("revenue")}`,
    evEbitda: `${L("ev")}/${L("ebitda")}`,
  };
  for (const col of COMPS_SHEET_COLUMNS) {
    if (col.key === "company" || col.key === "ticker" || col.key === "ltmEnd")
      continue;
    const key = col.key;
    const cell = row.getCell(colOf(key));
    const m = r.cells![key];
    if (!usable(m)) {
      putStatus(cell, m);
      continue;
    }
    const result = MONEY_COLUMNS.includes(key) ? m.value / MILLION : m.value;
    const link = LINKED[key];
    if (link) {
      const ref = refs[link];
      if (!ref)
        throw new Error(
          `${r.ticker} ${key}: no Calculations cell for a usable value`,
        );
      putFormula(cell, `Calculations!${ref}`, result, col.fmt!, "link");
    } else putFormula(cell, same[key]!, result, col.fmt!);
  }
}

const STAT_ROWS = [
  { label: "Mean", stat: "mean", fn: (rng: string) => `AVERAGE(${rng})` },
  { label: "Median", stat: "median", fn: (rng: string) => `MEDIAN(${rng})` },
  { label: "High", stat: "high", fn: (rng: string) => `MAX(${rng})` },
  { label: "Low", stat: "low", fn: (rng: string) => `MIN(${rng})` },
  {
    label: "25th percentile",
    stat: "p25",
    fn: (rng: string) => `_xlfn.PERCENTILE.INC(${rng},0.25)`,
  },
  {
    label: "75th percentile",
    stat: "p75",
    fn: (rng: string) => `_xlfn.PERCENTILE.INC(${rng},0.75)`,
  },
  { label: "n", stat: "nValid", fn: (rng: string) => `COUNT(${rng})` },
] as const;

function tradingComps(
  wb: ExcelJS.Workbook,
  s: ExportSnapshot,
  refsOf: Map<string, CompanyRefs>,
) {
  const ws = wb.getWorksheet(SHEET_NAMES.comps)!;
  const { table } = s;
  const t = table.target.fundamentals!.identity;
  ws.columns = COMPS_SHEET_COLUMNS.map((c) => ({ width: c.width }));

  putText(ws.getCell("A1"), "PeerSet — Trading Comparables", {
    bold: true,
    size: 14,
  });
  putText(ws.getCell("A2"), `${t.name} (${t.ticker})`, {
    bold: true,
    size: 12,
  });
  putText(ws.getCell("A3"), `SIC ${t.sic} · ${t.sicDescription}`);
  putText(ws.getCell("A4"), `Analysis date: ${s.analysisDate}`);
  putText(
    ws.getCell("A5"),
    s.priceDate
      ? `Prices as of ${s.priceDate} · source: entered by user`
      : "Prices: none entered · valuation cells show —",
  );
  putText(ws.getCell("A6"), "USD in millions, except per-share data", {
    italic: true,
  });

  const header = ws.getRow(HEADER_ROW);
  COMPS_SHEET_COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    putText(cell, c.header, { bold: true });
    cell.border = ruleBelow;
    cell.alignment = { horizontal: i < 2 ? "left" : "right", wrapText: true };
  });

  compsRow(ws, TARGET_ROW, table.target, refsOf.get(table.target.ticker)!);
  const targetRow = ws.getRow(TARGET_ROW);
  for (let c = 1; c <= COMPS_SHEET_COLUMNS.length; c++) {
    const cell = targetRow.getCell(c);
    cell.fill = fill(COLOR.targetFill);
    cell.font = { ...cell.font, bold: true };
  }

  const loaded = table.peers.filter((r) => r.cells);
  loaded.forEach((r, i) => {
    const n = FIRST_PEER_ROW + i;
    compsRow(ws, n, r, refsOf.get(r.ticker)!);
    if (i % 2 === 1)
      for (let c = 1; c <= COMPS_SHEET_COLUMNS.length; c++)
        ws.getRow(n).getCell(c).fill = fill(COLOR.bandFill);
  });

  // Statistics: formulas over the loaded peer rows only (the target is row 9).
  const last = FIRST_PEER_ROW + loaded.length - 1;
  let r = FIRST_PEER_ROW + Math.max(loaded.length, 1) + 1;
  const showPercentiles = IMPLIED_MULTIPLES.some(
    (m) => s.implied[m.key].status === "ok",
  );
  const statRow: Partial<Record<string, number>> = {};
  for (const spec of STAT_ROWS) {
    if ((spec.stat === "p25" || spec.stat === "p75") && !showPercentiles)
      continue;
    const row = ws.getRow(r);
    statRow[spec.stat] = r;
    putText(row.getCell(1), spec.label, { bold: true });
    if (spec.stat === "mean")
      for (let c = 1; c <= COMPS_SHEET_COLUMNS.length; c++)
        row.getCell(c).border = {
          top: { style: "thin", color: { argb: COLOR.rule } },
        };
    for (const col of STAT_COLUMNS) {
      const cell = row.getCell(colOf(col));
      const stats = table.stats[col as StatColumn];
      const value = spec.stat === "nValid" ? stats.nValid : stats[spec.stat];
      if (loaded.length === 0 || value === null) {
        putDash(
          cell,
          loaded.length === 0 ? "no peers loaded" : "no valid peer value",
        );
        continue;
      }
      const L = letterOf(col);
      const fmt =
        spec.stat === "nValid"
          ? null
          : COMPS_SHEET_COLUMNS[colOf(col) - 1].fmt!;
      if (fmt === null) {
        cell.value = {
          formula: spec.fn(`${L}${FIRST_PEER_ROW}:${L}${last}`),
          result: value,
        };
        cell.numFmt = "0";
        cell.font = font("formula");
      } else
        putFormula(
          cell,
          spec.fn(`${L}${FIRST_PEER_ROW}:${L}${last}`),
          MONEY_COLUMNS.includes(col) ? value / MILLION : value,
          fmt,
        );
    }
    r++;
  }
  r++;

  // Implied valuation (methodology §13)
  const targetRefs = refsOf.get(table.target.ticker)!;
  putText(ws.getCell(r, 1), `Implied valuation of ${t.ticker}`, {
    bold: true,
    size: 12,
  });
  r++;
  putMuted(
    ws.getCell(r, 1),
    "Target LTM metric × peer multiple = implied EV; less total debt, plus cash = implied equity value; ÷ shares = implied price. Peers only; arithmetic, not a price target.",
  );
  r += 2;
  const POINT_COL: Record<ImpliedPoint, number> = { p25: 3, median: 4, p75: 5 };
  for (const spec of IMPLIED_MULTIPLES) {
    const res = s.implied[spec.key];
    headerRow(ws.getRow(r), [
      `${spec.label}${res.status === "ok" ? ` (${res.nPeers} peers)` : ""}`,
      null,
      "25th percentile",
      "Median",
      "75th percentile",
    ]);
    r++;
    if (res.status !== "ok") {
      putMuted(ws.getCell(r, 1), `Unsupported: ${res.reason}`);
      r += 2;
      continue;
    }
    const rows = {
      multiple: r,
      metric: r + 1,
      ev: r + 2,
      debt: r + 3,
      cash: r + 4,
      equity: r + 5,
      shares: r + 6,
      price: r + 7,
    };
    const labels: Record<keyof typeof rows, string> = {
      multiple: `Peer ${spec.label}`,
      metric: `Target ${spec.metricLabel}`,
      ev: "Implied EV",
      debt: "Less: total debt",
      cash: "Plus: cash and short-term investments",
      equity: "Implied equity value",
      shares: "Shares (m)",
      price: "Implied price (USD per share)",
    };
    for (const [k, n] of Object.entries(rows))
      putText(ws.getCell(n, 1), labels[k as keyof typeof rows], {
        bold: k === "price",
      });
    const mL = letterOf(spec.key);
    const metricRef = `$${letterOf(spec.metric)}$${TARGET_ROW}`;
    for (const p of IMPLIED_POINTS) {
      const c = POINT_COL[p];
      const L = colLetter(c);
      const pt = res.points[p];
      const statKey = p === "median" ? "median" : p;
      putFormula(
        ws.getCell(rows.multiple, c),
        `${mL}${statRow[statKey]}`,
        pt.multiple,
        "multiple",
      );
      putFormula(
        ws.getCell(rows.metric, c),
        metricRef,
        res.metricValue / MILLION,
        "millions",
      );
      putFormula(
        ws.getCell(rows.ev, c),
        `${L}${rows.multiple}*${L}${rows.metric}`,
        pt.impliedEv / MILLION,
        "millions",
      );
      putFormula(
        ws.getCell(rows.debt, c),
        `Calculations!${targetRefs.totalDebt}`,
        res.totalDebt / MILLION,
        "millions",
        "link",
      );
      putFormula(
        ws.getCell(rows.cash, c),
        `Calculations!${targetRefs.cash}`,
        res.cash / MILLION,
        "millions",
        "link",
      );
      putFormula(
        ws.getCell(rows.equity, c),
        `${L}${rows.ev}-${L}${rows.debt}+${L}${rows.cash}`,
        pt.impliedEquity / MILLION,
        "millions",
      );
      putFormula(
        ws.getCell(rows.shares, c),
        `Calculations!${targetRefs.shares}`,
        res.shares / MILLION,
        "shares",
        "link",
      );
      putFormula(
        ws.getCell(rows.price, c),
        `${L}${rows.equity}/${L}${rows.shares}`,
        pt.impliedPrice,
        "perShare",
      );
    }
    r = rows.price + 2;
  }

  // Peers that failed to load: listed here, outside every statistics range.
  const failed = table.peers.filter((p) => !p.cells);
  if (failed.length > 0) {
    putText(ws.getCell(r++, 1), "Peers not loaded (not in the statistics)", {
      bold: true,
    });
    for (const p of failed)
      putMuted(
        ws.getCell(r++, 1),
        `${p.ticker}: ${p.failure?.message ?? p.state}`,
      );
    r++;
  }

  // Notes
  putText(ws.getCell(r++, 1), "Notes", { bold: true });
  const notes = [
    'EBITDA (standardized, unadjusted) = operating income + D&A from the cash-flow statement. No add-backs; never "Adjusted EBITDA".',
    `NM (not meaningful): revenue, EBITDA or EPS ≤ 0, EV ≤ 0, or a multiple above ${NM_MULTIPLE_CAP.toFixed(1)}x. "—" = an input is missing. Unsupported = the method can't apply; the reason is in the cell note and on Calculations.`,
    "Equity value uses basic shares outstanding from each filing's cover page, not diluted shares (treasury stock method not applied).",
    "Statistics are over peers only; the target is excluded. NM, — and Unsupported are text, so Excel's statistics skip them.",
    "Blue = hardcoded input (on Calculations) · black = formula · green = link to Calculations. USD millions at full precision; formats do the rounding.",
    "Prices are end-of-day closes entered by the user; PeerSet doesn't supply market data.",
  ];
  notes.forEach((n, i) => putMuted(ws.getCell(r++, 1), `${i + 1}. ${n}`));
  if (s.missing.length > 0) {
    r++;
    putText(ws.getCell(r++, 1), "Shown as text, not numbers", { bold: true });
    for (const m of s.missing)
      putMuted(
        ws.getCell(r++, 1),
        `${m.ticker} ${COLUMN_LABEL[m.column]}: ${STATUS_TEXT[m.status]}, ${m.reason}`,
      );
  }
  if (s.warnings.length > 0) {
    r++;
    putText(ws.getCell(r++, 1), "Warnings", { bold: true });
    for (const w of s.warnings)
      putMuted(ws.getCell(r++, 1), `${w.ticker}: ${w.message}`);
  }
  r++;
  putMuted(ws.getCell(r, 1), DISCLAIMER);

  ws.views = [
    { state: "frozen", xSplit: 2, ySplit: HEADER_ROW, topLeftCell: "C9" },
  ];
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  };
}

// ── Sources & Methodology ───────────────────────────────────────────────────

const SEC_URL = /^https:\/\/www\.sec\.gov\/[A-Za-z0-9/._-]+$/;

function sources(wb: ExcelJS.Workbook, s: ExportSnapshot) {
  const ws = wb.getWorksheet(SHEET_NAMES.sources)!;
  ws.columns = [14, 34, 52, 12, 12, 18, 11, 8, 23, 12, 13, 14].map((width) => ({
    width,
  }));
  headerRow(ws.getRow(1), [
    "Company",
    "Metric",
    "Concept",
    "Period start",
    "Period end",
    "Value",
    "Unit",
    "Form",
    "Accession",
    "Filed",
    "Source",
    "Filing index",
  ]);
  let r = 2;
  const fact = (ticker: string, metric: string, x: ReportedFinancialFact) => {
    const row = ws.getRow(r++);
    putText(row.getCell(1), ticker);
    putText(row.getCell(2), metric);
    putText(row.getCell(3), x.concept);
    for (const [c, iso] of [
      [4, x.period.start],
      [5, x.period.end],
      [10, x.filing.filedDate],
    ] as const)
      if (iso) {
        row.getCell(c).value = isoDate(iso);
        row.getCell(c).numFmt = NUM_FMT.date;
        row.getCell(c).font = font("input");
      }
    putInput(
      row.getCell(6),
      x.value,
      x.unit === "USD/shares" ? "perShare" : "dollars",
    );
    putText(row.getCell(7), x.unit);
    putText(row.getCell(8), x.filing.form);
    putText(row.getCell(9), x.filing.accession);
    putText(row.getCell(11), x.source);
    if (SEC_URL.test(x.filing.indexUrl)) {
      const link = row.getCell(12);
      link.value = {
        formula: `HYPERLINK("${x.filing.indexUrl}","Filing index")`,
        result: "Filing index",
      };
      link.font = font("link", { underline: true });
    }
  };

  for (const row of [s.table.target, ...s.table.peers]) {
    const f = row.fundamentals;
    if (!f) continue;
    for (const [key, calc] of Object.entries(f.ltmDetail)) {
      const label = key.startsWith("da:")
        ? `D&A part (${calc.concept})`
        : METRIC_KEYS.includes(key as MetricKey)
          ? METRIC_LABEL[key as MetricKey]
          : key;
      fact(row.ticker, `${label}: FY`, calc.fy);
      if (calc.ytdCurrent) fact(row.ticker, `${label}: YTD`, calc.ytdCurrent);
      if (calc.ytdPrior)
        fact(row.ticker, `${label}: prior-year YTD`, calc.ytdPrior);
    }
    for (const c of f.shareClasses.classes)
      fact(
        row.ticker,
        `Shares outstanding (cover)${c.ticker ? `: ${c.ticker}` : ""}`,
        c.fact,
      );
    for (const [name, item] of [
      ["Debt", f.debt],
      ["Cash", f.cash],
      ["Preferred", f.evAdjustments.preferred],
      ["NCI", f.evAdjustments.nci],
    ] as const)
      for (const l of item.lines)
        if (l.fact)
          fact(
            row.ticker,
            `${name}: ${l.label}${l.included ? "" : " (excluded)"}`,
            l.fact,
          );
  }

  const section = (title: string, lines: string[]) => {
    r++;
    putText(ws.getCell(r++, 1), title, { bold: true });
    for (const l of lines) putMuted(ws.getCell(r++, 1), l);
  };

  r++;
  headerRow(ws.getRow(r++), [
    "Prices",
    "Ticker",
    "Close (USD)",
    "Price date",
    "Source",
  ]);
  for (const q of s.quotes) {
    const row = ws.getRow(r++);
    putText(row.getCell(2), q.symbol);
    putInput(row.getCell(3), q.close, "perShare");
    row.getCell(4).value = isoDate(q.asOfDate);
    row.getCell(4).numFmt = NUM_FMT.date;
    row.getCell(4).font = font("input");
    putText(
      row.getCell(5),
      q.source === "user_entered" ? "entered by user" : "Alpha Vantage",
    );
  }
  if (s.quotes.length === 0) putMuted(ws.getCell(r++, 2), "No prices entered");

  const sel = s.peerSelection;
  section("Peer selection", [
    ...(sel
      ? [
          `Screened by SIC (${sel.tier}) and size from the peer index generated ${sel.indexGeneratedAt.slice(0, 10)}.`,
          ...sel.selected.map((p) => `${p.ticker}: ${p.reason}`),
        ]
      : [`Screening unavailable: ${s.peerSelectionError ?? "unknown"}`]),
    ...s.table.peers
      .filter((p) => p.origin === "added")
      .map((p) => `${p.ticker}: added by the user`),
  ]);
  section("Definitions", [
    "LTM after a 10-Q = FY(prior) + YTD(current) − YTD(prior year); after a 10-K = that fiscal year. Q4 is never derived.",
    "EBITDA (standardized, unadjusted) = operating income + D&A (cash-flow statement). EBITDA margin = EBITDA ÷ revenue.",
    "Equity value = Σ over share classes of price × cover-page shares. EV = equity value + total debt − cash and short-term investments.",
    "Total debt and cash are the sums of the lines the company presents on its balance sheet (methodology §7–§8).",
    "EV/Revenue = EV ÷ LTM revenue · EV/EBITDA = EV ÷ LTM EBITDA · P/E = price ÷ LTM diluted EPS (single-class companies only).",
    "Implied valuation = target LTM metric × peer 25th percentile, median and 75th percentile multiple; less debt, plus cash; ÷ shares.",
  ]);
  section("NM policy", [
    `NM when revenue, EBITDA or EPS ≤ 0, when EV ≤ 0 (EV multiples), or when a multiple is above ${NM_MULTIPLE_CAP.toFixed(1)}x.`,
    'A missing input shows "—", never NM and never 0. A method that can\'t apply shows Unsupported with its reason.',
    "NM, — and Unsupported never enter a statistic.",
  ]);
  section("Limitations", [
    "Shares are basic (cover page), not diluted by the treasury stock method.",
    "Preferred stock, noncontrolling interests and equity-method investments are not in EV; a warning flags material ones.",
    "EBITDA is unadjusted: no restructuring, stock-compensation or acquisition add-backs.",
    "Peers are screened by SIC code and revenue size; SIC misses business-model differences.",
    "USD filers with 10-K/10-Q only. Figures are first-pass and not a substitute for analyst review.",
  ]);
  section("Price source", [
    "Prices are end-of-day closes entered by the user in PeerSet; they are inputs, not data from SEC or PeerSet.",
  ]);
  section("Versions", [
    `PeerSet app version ${s.appVersion} · methodology version ${s.methodologyVersion}`,
    `Generated ${s.generatedAt} · analysis date ${s.analysisDate}`,
    "Source data: SEC EDGAR (companyfacts API and filings). Every number traces to its filing, period and XBRL concept.",
  ]);

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

export function buildWorkbook(s: ExportSnapshot): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PeerSet";
  wb.created = new Date(s.generatedAt);
  wb.modified = new Date(s.generatedAt);
  wb.calcProperties.fullCalcOnLoad = true;
  wb.addWorksheet(SHEET_NAMES.comps);
  const calc = wb.addWorksheet(SHEET_NAMES.calc);
  wb.addWorksheet(SHEET_NAMES.sources);

  calc.columns = CALC_WIDTHS.map((width) => ({ width }));
  putText(
    calc.getCell("A1"),
    "Calculations (USD millions; EPS and prices in USD per share)",
    {
      bold: true,
      size: 12,
    },
  );
  putMuted(
    calc.getCell("A2"),
    "Blue = hardcoded input from the filing or the price entered · black = formula. Trading Comps links here.",
  );
  const cur = new Cursor(calc, 4);
  const refsOf = new Map<string, CompanyRefs>();
  for (const r of [s.table.target, ...s.table.peers])
    if (r.cells) refsOf.set(r.ticker, companyBlock(cur, r));
  calc.views = [{ state: "frozen", xSplit: 1, ySplit: 0 }];
  calc.pageSetup = {
    ...calc.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  tradingComps(wb, s, refsOf);
  sources(wb, s);
  return wb;
}
