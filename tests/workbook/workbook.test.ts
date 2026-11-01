import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { STAT_COLUMNS, type CompsColumn, type CompsPeer } from "@/domain/comps";
import { IMPLIED_POINTS } from "@/domain/impliedValuation";
import type { Metric } from "@/domain/types";
import { buildExportSnapshot, type ExportSnapshot } from "@/export/snapshot";
import {
  COMPS_SHEET_COLUMNS,
  FIRST_PEER_ROW,
  HEADER_ROW,
  SHEET_NAMES,
  TARGET_ROW,
  buildWorkbook,
} from "@/export/workbook";
import { NUM_FMT } from "@/export/styles";
import { loadExportSnapshot } from "@/lib/exportSnapshot";
import {
  fixtureDeps,
  GENERATED_AT,
  GOLDEN_REQUEST,
} from "../helpers/exportFixture";
import { fixtureFundamentals } from "../helpers/fundamentals";
import { readZipEntry } from "../helpers/zip";

// Workbook validation (blueprint §16, §17): the generated file is read back with
// ExcelJS and checked against the snapshot it was built from.

async function roundTrip(s: ExportSnapshot) {
  const buffer = Buffer.from(await buildWorkbook(s).xlsx.writeBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return { wb, buffer, bytes: buffer.byteLength };
}

type Value = ExcelJS.CellValue;
const isFormula = (v: Value): v is ExcelJS.CellFormulaValue =>
  typeof v === "object" && v !== null && "formula" in v;
const numberOf = (v: Value): number | null =>
  typeof v === "number"
    ? v
    : isFormula(v) && typeof v.result === "number"
      ? v.result
      : null;

const MONEY: CompsColumn[] = ["marketCap", "ev", "revenue", "ebitda"];
const usable = (m: Metric): m is Extract<Metric, { value: number }> =>
  m.status === "reported" || m.status === "derived";

// Money to the cent (in USD), everything else to 1e-9 relative.
function expectSame(col: CompsColumn, got: number, want: number, at: string) {
  if (MONEY.includes(col))
    expect(Math.abs(got * 1e6 - want), at).toBeLessThan(0.005);
  else
    expect(Math.abs(got - want), at).toBeLessThanOrEqual(
      1e-9 * Math.max(1, Math.abs(want)),
    );
}

const colOf = (c: CompsColumn) =>
  COMPS_SHEET_COLUMNS.findIndex((x) => x.key === c) + 1;

function rowByLabel(ws: ExcelJS.Worksheet, label: string): number {
  let found = -1;
  ws.eachRow((row, n) => {
    if (found < 0 && row.getCell(1).value === label) found = n;
  });
  if (found < 0) throw new Error(`no row labeled ${label}`);
  return found;
}

let snapshot: ExportSnapshot;
let wb: ExcelJS.Workbook;
let bytes: number;
let buffer: Buffer;
let comps: ExcelJS.Worksheet;
beforeAll(async () => {
  snapshot = await loadExportSnapshot(GOLDEN_REQUEST, fixtureDeps());
  ({ wb, bytes, buffer } = await roundTrip(snapshot));
  comps = wb.getWorksheet(SHEET_NAMES.comps)!;
}, 30_000);

describe("workbook structure", () => {
  it("has the three sheets, in order", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Trading Comps",
      "Calculations",
      "Sources & Methodology",
    ]);
  });

  it("header block rows 1–6", () => {
    const t = snapshot.table.target.fundamentals!.identity;
    expect(comps.getCell("A1").value).toBe("PeerSet — Trading Comparables");
    expect(comps.getCell("A2").value).toBe(`${t.name} (${t.ticker})`);
    expect(comps.getCell("A3").value).toBe(
      `SIC ${t.sic} · ${t.sicDescription}`,
    );
    expect(comps.getCell("A4").value).toBe("Analysis date: 2026-10-26");
    expect(comps.getCell("A5").value).toBe(
      "Prices as of 2026-10-23 · source: entered by user",
    );
    expect(comps.getCell("A6").value).toBe(
      "USD in millions, except per-share data",
    );
  });

  it("column headers on row 8", () => {
    expect(
      COMPS_SHEET_COLUMNS.map(
        (_, i) => comps.getRow(HEADER_ROW).getCell(i + 1).value,
      ),
    ).toEqual([
      "Company",
      "Ticker",
      "Fin. through",
      "Price",
      "Equity value",
      "EV",
      "LTM revenue",
      "LTM EBITDA",
      "EBITDA margin",
      "EV/Revenue",
      "EV/EBITDA",
      "P/E",
    ]);
  });

  it("target on row 9, bold with a fill; peers from row 11 equal the selected set", () => {
    expect(comps.getCell(TARGET_ROW, 2).value).toBe("LII");
    expect(comps.getCell(TARGET_ROW, 1).font?.bold).toBe(true);
    expect(comps.getCell(TARGET_ROW, 1).fill).toMatchObject({
      type: "pattern",
    });
    const peers = snapshot.table.peers.map((r) => r.ticker);
    expect(
      peers.map((_, i) => comps.getCell(FIRST_PEER_ROW + i, 2).value),
    ).toEqual(peers);
    expect(comps.getCell(FIRST_PEER_ROW + peers.length, 2).value).toBeNull();
  });
});

describe("values equal the domain", () => {
  it("every cell: numbers are numbers with cached results equal to the domain; others are text, never 0", () => {
    const rows = [snapshot.table.target, ...snapshot.table.peers];
    rows.forEach((r, i) => {
      const row = i === 0 ? TARGET_ROW : FIRST_PEER_ROW + i - 1;
      for (const { key } of COMPS_SHEET_COLUMNS) {
        if (key === "company" || key === "ticker" || key === "ltmEnd") continue;
        const m = r.cells![key];
        const cell = comps.getCell(row, colOf(key));
        const at = `${r.ticker} ${key}`;
        if (usable(m)) {
          const n = numberOf(cell.value);
          expect(n, at).not.toBeNull();
          expectSame(key, n!, m.value, at);
        } else {
          expect(typeof cell.value, at).toBe("string");
          expect(cell.value, at).toBe(
            m.status === "nm"
              ? "NM"
              : m.status === "missing"
                ? "—"
                : "Unsupported",
          );
        }
      }
    });
  });

  it("derived figures are formulas, not pasted values", () => {
    for (const key of ["ebitdaMargin", "evRevenue", "evEbitda"] as const)
      expect(isFormula(comps.getCell(TARGET_ROW, colOf(key)).value), key).toBe(
        true,
      );
  });

  it("links to Calculations are green; same-sheet formulas black", () => {
    const ev = comps.getCell(TARGET_ROW, colOf("ev"));
    expect(isFormula(ev.value) && ev.value.formula).toMatch(/^Calculations!/);
    expect(ev.font?.color?.argb).toBe("FF008000");
    expect(comps.getCell(TARGET_ROW, colOf("evEbitda")).font?.color?.argb).toBe(
      "FF000000",
    );
  });

  it("Fin. through is a date", () => {
    expect(comps.getCell(TARGET_ROW, 3).value).toEqual(
      new Date("2026-06-30T00:00:00Z"),
    );
  });
});

describe("statistics", () => {
  const n = () => snapshot.table.peers.length;
  const range = (c: number) => {
    const L = comps.getColumn(c).letter;
    return `${L}${FIRST_PEER_ROW}:${L}${FIRST_PEER_ROW + n() - 1}`;
  };
  const STAT_ROWS = [
    ["Mean", "AVERAGE", "mean"],
    ["Median", "MEDIAN", "median"],
    ["High", "MAX", "high"],
    ["Low", "MIN", "low"],
    ["25th percentile", "_xlfn.PERCENTILE.INC", "p25"],
    ["75th percentile", "_xlfn.PERCENTILE.INC", "p75"],
    ["n", "COUNT", "nValid"],
  ] as const;

  it.each(STAT_ROWS)(
    "%s is %s over the peer rows only, equal to the web table",
    (label, fn, stat) => {
      const r = rowByLabel(comps, label);
      for (const col of STAT_COLUMNS) {
        const v = comps.getCell(r, colOf(col)).value;
        expect(isFormula(v), `${label} ${col}`).toBe(true);
        if (!isFormula(v)) continue;
        expect(
          v.formula.startsWith(`${fn}(${range(colOf(col))}`),
          v.formula,
        ).toBe(true);
        const want = snapshot.table.stats[col][stat]!;
        if (stat === "nValid") expect(v.result).toBe(want);
        else expectSame(col, v.result as number, want, `${label} ${col}`);
      }
    },
  );

  it("no statistic covers the target row", () => {
    const r = rowByLabel(comps, "Mean");
    for (const col of STAT_COLUMNS) {
      const f = (comps.getCell(r, colOf(col)).value as ExcelJS.CellFormulaValue)
        .formula;
      expect(f).not.toContain(`${TARGET_ROW}:`);
    }
  });

  it("JCI's Unsupported EV/EBITDA is text inside the range, so COUNT skips it", () => {
    const jci = snapshot.table.peers.findIndex((r) => r.ticker === "JCI");
    expect(comps.getCell(FIRST_PEER_ROW + jci, colOf("evEbitda")).value).toBe(
      "Unsupported",
    );
    expect(
      (
        comps.getCell(rowByLabel(comps, "n"), colOf("evEbitda"))
          .value as ExcelJS.CellFormulaValue
      ).result,
    ).toBe(4);
  });
});

describe("implied valuation", () => {
  it("the median EV/EBITDA implied price is a formula equal to the domain", () => {
    const r = snapshot.implied.evEbitda;
    if (r.status !== "ok") throw new Error("expected ok");
    const row = rowByLabel(comps, "Implied price (USD per share)");
    IMPLIED_POINTS.forEach((p, i) => {
      const v = comps.getCell(row, 3 + i).value;
      expect(isFormula(v)).toBe(true);
      expect(
        Math.abs((numberOf(v) ?? NaN) - r.points[p].impliedPrice),
      ).toBeLessThan(0.005);
    });
  });
});

describe("formatting", () => {
  it("freezes below the headers and after Ticker", () => {
    expect(comps.views[0]).toMatchObject({
      state: "frozen",
      xSplit: 2,
      ySplit: HEADER_ROW,
    });
  });

  it("number formats per column", () => {
    const fmt = (c: CompsColumn) => comps.getCell(TARGET_ROW, colOf(c)).numFmt;
    expect(fmt("ev")).toBe(NUM_FMT.millions);
    expect(fmt("price")).toBe(NUM_FMT.perShare);
    expect(fmt("ebitdaMargin")).toBe(NUM_FMT.percent);
    expect(fmt("evEbitda")).toBe(NUM_FMT.multiple);
    expect(NUM_FMT).toMatchObject({
      millions: "#,##0.0_);(#,##0.0)",
      perShare: "#,##0.00_);(#,##0.00)",
      multiple: '0.0"x"',
      percent: "0.0%_);(0.0%)",
      date: "yyyy-mm-dd",
    });
  });

  it("status text is grey and right-aligned", () => {
    const jci = snapshot.table.peers.findIndex((r) => r.ticker === "JCI");
    const c = comps.getCell(FIRST_PEER_ROW + jci, colOf("evEbitda"));
    expect(c.alignment?.horizontal).toBe("right");
    expect(c.font?.color?.argb).toBe("FF808080");
  });

  it("prints landscape, one page wide, header row repeated", () => {
    expect(comps.pageSetup).toMatchObject({
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
    });
  });

  // ExcelJS writes calcPr but doesn't read it back, so check the file's XML.
  it("recalculates fully on open", async () => {
    expect(await readZipEntry(buffer, "xl/workbook.xml")).toMatch(
      /<calcPr[^>]*fullCalcOnLoad="1"/,
    );
  });

  it("Sources links each fact to its SEC filing index", () => {
    const src = wb.getWorksheet(SHEET_NAMES.sources)!;
    const links: string[] = [];
    src.eachRow((row) =>
      row.eachCell((c) => {
        if (isFormula(c.value) && c.value.formula.startsWith("HYPERLINK("))
          links.push(c.value.formula);
      }),
    );
    expect(links.length).toBeGreaterThan(20);
    for (const l of links)
      expect(l).toMatch(/^HYPERLINK\("https:\/\/www\.sec\.gov\//);
  });

  it("stays well under Vercel's 4.5 MB limit", () => {
    expect(bytes).toBeLessThan(500_000);
  });
});

describe("text and small values", () => {
  it("no label PeerSet writes is caught by the injection guard", () => {
    for (const ws of wb.worksheets)
      ws.eachRow((row) =>
        row.eachCell((c) => {
          if (typeof c.value === "string")
            expect(c.value.startsWith("'"), `${ws.name}!${c.address}`).toBe(
              false,
            );
        }),
      );
  });

  it("every blue input on Calculations has a note citing its source", () => {
    const calc = wb.getWorksheet(SHEET_NAMES.calc)!;
    let inputs = 0;
    calc.eachRow((row) =>
      row.eachCell((c) => {
        if (typeof c.value !== "number") return;
        inputs++;
        const note =
          typeof c.note === "string"
            ? c.note
            : (c.note?.texts ?? []).map((t) => t.text).join("");
        expect(note, c.address).toMatch(
          /(10-[KQ]|entered by user|cover page|PeerSet)/,
        );
      }),
    );
    expect(inputs).toBeGreaterThan(100);
  });

  it("a nonzero amount under 0.05M shows three decimals, never 0.0", () => {
    const calc = wb.getWorksheet(SHEET_NAMES.calc)!;
    let found = false;
    calc.eachRow((row) =>
      row.eachCell((c) => {
        if (
          typeof c.value === "number" &&
          c.value !== 0 &&
          Math.abs(c.value) < 0.05
        ) {
          found = true;
          expect(c.numFmt, c.address).toBe(NUM_FMT.smallMillions);
        }
      }),
    );
    expect(found).toBe(true); // AAON's $13,000 cash
  });
});

describe("NM, missing and formula injection", { timeout: 30_000 }, () => {
  it("no prices: valuation cells are '—' text, statistics of nothing are '—'", async () => {
    const s = await loadExportSnapshot(
      { target: "LII", add: ["TT", "WSO"], remove: ["GGG"], prices: {} },
      fixtureDeps(),
    );
    const { wb } = await roundTrip(s);
    const ws = wb.getWorksheet(SHEET_NAMES.comps)!;
    expect(ws.getCell(TARGET_ROW, colOf("ev")).value).toBe("—");
    expect(ws.getCell(rowByLabel(ws, "Mean"), colOf("ev")).value).toBe("—");
    expect(
      ws.getCell(rowByLabel(ws, "Median"), colOf("revenue")).value,
    ).not.toBe("—");
    ws.eachRow((row) =>
      row.eachCell((c) => {
        if (isFormula(c.value) && c.value.formula.startsWith("MAX("))
          expect(c.value.result).not.toBe(0);
      }),
    );
  });

  it("an NM multiple is the text 'NM', never 0, and stays out of the statistics", async () => {
    const target = await fixtureFundamentals("LII");
    const aaon = await fixtureFundamentals("AAON");
    const negative = {
      ...aaon,
      metrics: {
        ...aaon.metrics,
        ebitda: {
          ...(aaon.metrics.ebitda as Extract<Metric, { value: number }>),
          value: -5_000_000,
        },
      },
    };
    const peers: CompsPeer[] = [
      {
        ticker: "AAON",
        origin: "suggested",
        reason: "test",
        state: { kind: "loaded", fundamentals: negative },
      },
      {
        ticker: "CARR",
        origin: "suggested",
        reason: "test",
        state: {
          kind: "loaded",
          fundamentals: await fixtureFundamentals("CARR"),
        },
      },
    ];
    const s = buildExportSnapshot({
      target,
      peers,
      quotes: ["LII", "AAON", "CARR"].map((symbol) => ({
        symbol,
        close: 100,
        currency: "USD" as const,
        asOfDate: "2026-10-23",
        source: "user_entered" as const,
        retrievedAt: GENERATED_AT,
      })),
      analysisDate: "2026-10-26",
      generatedAt: GENERATED_AT,
      appVersion: "test",
      peerSelection: null,
    });
    const { wb } = await roundTrip(s);
    const ws = wb.getWorksheet(SHEET_NAMES.comps)!;
    expect(ws.getCell(FIRST_PEER_ROW, colOf("evEbitda")).value).toBe("NM");
    expect(
      (
        ws.getCell(rowByLabel(ws, "n"), colOf("evEbitda"))
          .value as ExcelJS.CellFormulaValue
      ).result,
    ).toBe(1);
  });

  it("a company name that looks like a formula is stored as inert text", async () => {
    const target = await fixtureFundamentals("LII");
    const evil = '=HYPERLINK("http://evil.example","click")';
    const s = buildExportSnapshot({
      target: { ...target, identity: { ...target.identity, name: evil } },
      peers: [],
      quotes: [],
      analysisDate: "2026-10-26",
      generatedAt: GENERATED_AT,
      appVersion: "test",
      peerSelection: null,
    });
    const { wb } = await roundTrip(s);
    for (const ws of wb.worksheets)
      ws.eachRow((row) =>
        row.eachCell((c) => {
          if (isFormula(c.value))
            expect(c.value.formula).not.toContain("evil.example");
          if (typeof c.value === "string" && c.value.includes("evil.example"))
            expect(c.value.startsWith("'") || !c.value.startsWith("=")).toBe(
              true,
            );
        }),
      );
    expect(
      wb.getWorksheet(SHEET_NAMES.comps)!.getCell(TARGET_ROW, 1).value,
    ).toBe(`'${evil}`);
  });
});
