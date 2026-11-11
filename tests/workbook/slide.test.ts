import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { createExportHandler } from "@/app/api/export/handler";
import { COMPS_COLUMNS, type CompsColumn } from "@/domain/comps";
import type { Metric } from "@/domain/types";
import {
  DEFAULT_SLIDE_OPTIONS,
  SLIDE_STATS,
  type SlideOptions,
} from "@/export/options";
import {
  buildSlideWorkbook,
  SLIDE_HEADER_ROW,
  SLIDE_SHEET_NAME,
  SLIDE_TARGET_ROW,
} from "@/export/slide";
import type { ExportSnapshot } from "@/export/snapshot";
import { loadExportSnapshot, parseExportOptions } from "@/lib/exportSnapshot";
import { fixtureDeps, GOLDEN_REQUEST } from "../helpers/exportFixture";

// The slide table (blueprint §17): one sheet, the chosen columns and summary rows,
// plain values equal to the snapshot's, and the sources under the table.

const MONEY: CompsColumn[] = ["marketCap", "ev", "revenue", "ebitda"];
const usable = (m: Metric): m is Extract<Metric, { value: number }> =>
  m.status === "reported" || m.status === "derived";

async function roundTrip(s: ExportSnapshot, o: SlideOptions) {
  const buffer = Buffer.from(await buildSlideWorkbook(s, o).xlsx.writeBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

function rowByLabel(ws: ExcelJS.Worksheet, label: string): number {
  let found = -1;
  ws.eachRow((row, n) => {
    if (found < 0 && row.getCell(1).value === label) found = n;
  });
  if (found < 0) throw new Error(`no row labeled ${label}`);
  return found;
}

const columnA = (ws: ExcelJS.Worksheet): string[] => {
  const out: string[] = [];
  ws.eachRow((row) => {
    const v = row.getCell(1).value;
    out.push(
      v && typeof v === "object" && "text" in v
        ? String(v.text)
        : String(v ?? ""),
    );
  });
  return out;
};

const ALL: SlideOptions = {
  columns: [...COMPS_COLUMNS],
  stats: [...SLIDE_STATS],
};

let snapshot: ExportSnapshot;
let ws: ExcelJS.Worksheet;
let wb: ExcelJS.Workbook;
beforeAll(async () => {
  snapshot = await loadExportSnapshot(GOLDEN_REQUEST, fixtureDeps());
  wb = await roundTrip(snapshot, ALL);
  ws = wb.getWorksheet(SLIDE_SHEET_NAME)!;
}, 30_000);

describe("slide table", () => {
  it("is one sheet", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Comps"]);
  });

  it("has no formulas: every cell is a plain value", () => {
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        const v = cell.value;
        expect(
          v && typeof v === "object" && "formula" in v,
          cell.address,
        ).toBeFalsy();
      }),
    );
  });

  it("every row and cell equals the snapshot; NM, — and Unsupported stay text", () => {
    const rows = [snapshot.table.target, ...snapshot.table.peers].filter(
      (r) => r.cells,
    );
    expect(rows.length).toBeGreaterThan(1);
    let texts = 0;
    rows.forEach((r, i) => {
      const row = ws.getRow(SLIDE_TARGET_ROW + i);
      expect(row.getCell(2).value).toBe(r.ticker);
      COMPS_COLUMNS.forEach((c, k) => {
        const cell = row.getCell(3 + k);
        const m = r.cells![c];
        const at = `${r.ticker} ${c}`;
        if (usable(m)) {
          const want = MONEY.includes(c) ? m.value / 1e6 : m.value;
          expect(typeof cell.value, at).toBe("number");
          expect(cell.value as number, at).toBeCloseTo(want, 9);
        } else {
          texts++;
          expect(typeof cell.value, at).toBe("string");
          expect(["NM", "—", "Unsupported"], at).toContain(cell.value);
        }
      });
    });
    // JCI has no operating income, so the golden set has text cells to check.
    expect(texts).toBeGreaterThan(0);
  });

  it("summary rows equal the snapshot's peer statistics", () => {
    const k = COMPS_COLUMNS.indexOf("evEbitda");
    const median = ws.getRow(rowByLabel(ws, "Peer median")).getCell(3 + k);
    expect(median.value as number).toBeCloseTo(
      snapshot.table.stats.evEbitda.median!,
      9,
    );
    const mean = ws.getRow(rowByLabel(ws, "Peer mean")).getCell(3 + k);
    expect(mean.value as number).toBeCloseTo(
      snapshot.table.stats.evEbitda.mean!,
      9,
    );
    // Price has no statistic.
    const price = ws
      .getRow(rowByLabel(ws, "Peer median"))
      .getCell(3 + COMPS_COLUMNS.indexOf("price"));
    expect(price.value).toBeNull();
  });

  it("lists the sources under the table, one filing per company", () => {
    const a = columnA(ws);
    expect(a).toContain("Sources");
    expect(a.some((t) => t.startsWith("Source: company SEC filings"))).toBe(
      true,
    );
    expect(a).toContain("Prices as of 2026-10-23 · source: entered by user");
    const rows = [snapshot.table.target, ...snapshot.table.peers].filter(
      (r) => r.cells,
    );
    for (const r of rows) {
      const f = r.fundamentals!.identity.latestPeriodic!;
      expect(
        a.some((t) =>
          t.includes(`(${r.ticker}): Form ${f.form} for the period`),
        ),
        r.ticker,
      ).toBe(true);
    }
    const lii = ws
      .getRow(rowByLabel(ws, "Latest filing by company") + 1)
      .getCell(1).value as ExcelJS.CellHyperlinkValue;
    expect(lii.hyperlink).toMatch(/^https:\/\/www\.sec\.gov\//);
  });

  it("shows only the chosen columns and summary rows, in table order", async () => {
    const small = await roundTrip(snapshot, {
      columns: ["evEbitda", "ev"],
      stats: ["median"],
    });
    const s = small.getWorksheet(SLIDE_SHEET_NAME)!;
    const head = s.getRow(SLIDE_HEADER_ROW);
    expect([1, 2, 3, 4, 5].map((c) => head.getCell(c).value)).toEqual([
      "Company",
      "Ticker",
      "EV",
      "EV/EBITDA",
      null,
    ]);
    const a = columnA(s);
    expect(a).toContain("Peer median");
    expect(a).not.toContain("Peer mean");
  });

  it("refuses an empty column list", () => {
    expect(() =>
      buildSlideWorkbook(snapshot, { columns: [], stats: [] }),
    ).toThrow(/at least one column/);
  });
});

describe("export options in the request", () => {
  it("absent options mean the full workbook", () => {
    expect(parseExportOptions(GOLDEN_REQUEST)).toEqual({ layout: "full" });
  });

  it("slide options come back in table order, each once", () => {
    expect(
      parseExportOptions({
        options: {
          layout: "slide",
          columns: ["pe", "ev", "pe"],
          stats: ["median", "mean"],
        },
      }),
    ).toEqual({
      layout: "slide",
      columns: ["ev", "pe"],
      stats: ["mean", "median"],
    });
  });

  it("rejects unknown columns, no columns and unknown layouts", () => {
    for (const options of [
      { layout: "slide", columns: ["profit"], stats: [] },
      { layout: "slide", columns: [], stats: [] },
      { layout: "pdf" },
    ])
      expect(() => parseExportOptions({ options })).toThrow(
        /export options aren't valid/,
      );
  });

  it("the route serves the slide table under its own file name", async () => {
    const res = await createExportHandler(fixtureDeps, () => {})(
      new Request("http://localhost/api/export", {
        method: "POST",
        body: JSON.stringify({
          ...GOLDEN_REQUEST,
          options: { layout: "slide", ...DEFAULT_SLIDE_OPTIONS },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="PeerSet_LII_slide_2026-10-26.xlsx"',
    );
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(await res.arrayBuffer());
    expect(out.worksheets.map((w) => w.name)).toEqual(["Comps"]);
  }, 30_000);
});
