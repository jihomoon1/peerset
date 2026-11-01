import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createExportHandler } from "@/app/api/export/handler";
import { SHEET_NAMES, TARGET_ROW } from "@/export/workbook";
import { fixtureDeps, GOLDEN_REQUEST } from "../helpers/exportFixture";

// POST /api/export on the frozen fixtures (blueprint §13): an .xlsx for a valid
// request, a user-safe JSON error otherwise. Never calls live SEC.
// Loading six fixture companies takes ~2 s alone and longer beside the full suite.
const SLOW = 30_000;

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const post = (body: unknown, raw = false) =>
  createExportHandler(fixtureDeps, () => {})(
    new Request("http://localhost/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );

describe("POST /api/export", { timeout: SLOW }, () => {
  it("returns the workbook as an attachment named for the ticker and date", async () => {
    const res = await post(GOLDEN_REQUEST);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(XLSX);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="PeerSet_LII_comps_2026-10-26.xlsx"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = await res.arrayBuffer();
    expect(bytes.byteLength).toBeLessThan(500_000);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    expect(
      wb.getWorksheet(SHEET_NAMES.comps)!.getCell(TARGET_ROW, 2).value,
    ).toBe("LII");
  });

  it.each([
    ["a malformed body", "{not json", true],
    [
      "13 added peers",
      { ...GOLDEN_REQUEST, add: Array.from({ length: 13 }, (_, i) => `A${i}`) },
      false,
    ],
    ["a zero price", { ...GOLDEN_REQUEST, prices: { LII: 0 } }, false],
    [
      "a future price date",
      { ...GOLDEN_REQUEST, priceDate: "2027-01-01" },
      false,
    ],
  ])("answers 400 with a plain message for %s", async (_l, body, raw) => {
    const res = await post(body, raw);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ code: "INVALID_INPUT" });
    expect(typeof json.message).toBe("string");
    expect(JSON.stringify(json)).not.toMatch(/schema:|at .*\.ts/);
  });

  it("answers 404 for an unknown target", async () => {
    const res = await post({ ...GOLDEN_REQUEST, target: "ZZZZZ" });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("TICKER_NOT_FOUND");
  });

  it("refuses an oversized body", async () => {
    const res = await post({ ...GOLDEN_REQUEST, pad: "x".repeat(40_000) });
    expect(res.status).toBe(400);
  });
});
