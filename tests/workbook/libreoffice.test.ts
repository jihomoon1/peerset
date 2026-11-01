import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildWorkbook } from "@/export/workbook";
import { loadExportSnapshot } from "@/lib/exportSnapshot";
import { fixtureDeps, GOLDEN_REQUEST } from "../helpers/exportFixture";

// Independent recalculation (blueprint §16, ADR 0010): the comps-golden workbook is
// written with every cached formula result removed, LibreOffice opens it headless with
// "always recalculate on load" and saves it again, and each value LibreOffice
// calculated must equal the cached result PeerSet writes. That proves the formulas
// themselves are right, not only the numbers stored next to them.
//
// Needs LibreOffice (`soffice`). CI's workbook-recalc job installs it and sets
// REQUIRE_LIBREOFFICE=1, so a missing binary fails there; locally the test is skipped
// when soffice isn't installed, because LibreOffice isn't a project dependency.

const SOFFICE = process.env.SOFFICE ?? "soffice";

function hasSoffice(): boolean {
  try {
    execFileSync(SOFFICE, ["--version"], { stdio: "ignore", timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

const required = process.env.REQUIRE_LIBREOFFICE === "1";
const available = hasSoffice();

// LibreOffice's setting "Recalculation on file load: Always" for Excel and ODF files.
const PROFILE = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>
`;

type Formula = ExcelJS.CellFormulaValue;
const isFormula = (v: ExcelJS.CellValue): v is Formula =>
  typeof v === "object" && v !== null && "formula" in v;

describe.skipIf(!available && !required)(
  "LibreOffice recalculation of the comps-golden workbook",
  () => {
    it("soffice is installed (required in CI)", () => {
      expect(available, `${SOFFICE} not found`).toBe(true);
    });

    it("every recalculated formula equals PeerSet's cached result", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "peerset-recalc-"));
      const snapshot = await loadExportSnapshot(GOLDEN_REQUEST, fixtureDeps());

      const original = buildWorkbook(snapshot);
      const stripped = buildWorkbook(snapshot);
      for (const ws of stripped.worksheets)
        ws.eachRow((row) =>
          row.eachCell((cell) => {
            const v = cell.value;
            if (isFormula(v)) cell.value = { formula: v.formula } as Formula;
          }),
        );
      const input = path.join(dir, "in", "comps-golden.xlsx");
      mkdirSync(path.dirname(input));
      writeFileSync(input, Buffer.from(await stripped.xlsx.writeBuffer()));

      const profile = path.join(dir, "profile");
      mkdirSync(path.join(profile, "user"), { recursive: true });
      writeFileSync(
        path.join(profile, "user", "registrymodifications.xcu"),
        PROFILE,
      );
      const outDir = path.join(dir, "out");
      execFileSync(
        SOFFICE,
        [
          `-env:UserInstallation=${pathToFileURL(profile).href}`,
          "--headless",
          "--norestore",
          "--convert-to",
          "xlsx",
          "--outdir",
          outDir,
          input,
        ],
        { stdio: "inherit", timeout: 120_000 },
      );

      const recalculated = new ExcelJS.Workbook();
      await recalculated.xlsx.load(
        readFileSync(
          path.join(outDir, "comps-golden.xlsx"),
        ) as unknown as ArrayBuffer,
      );

      let compared = 0;
      const mismatches: string[] = [];
      for (const ws of original.worksheets) {
        const other = recalculated.getWorksheet(ws.name);
        expect(other, ws.name).toBeDefined();
        ws.eachRow((row) =>
          row.eachCell((cell) => {
            const v = cell.value;
            if (!isFormula(v)) return;
            const got = other!.getCell(cell.address).value;
            const lo = isFormula(got) ? got.result : got;
            const at = `${ws.name}!${cell.address} ${v.formula}`;
            compared++;
            if (typeof v.result === "number") {
              const ok =
                typeof lo === "number" &&
                Math.abs(lo - v.result) <=
                  1e-9 * Math.max(1, Math.abs(v.result));
              if (!ok)
                mismatches.push(
                  `${at}: cached ${v.result}, LibreOffice ${String(lo)}`,
                );
            } else if (lo !== v.result)
              mismatches.push(
                `${at}: cached ${String(v.result)}, LibreOffice ${String(lo)}`,
              );
          }),
        );
      }
      // Print the three key cells for the M5 report.
      const k = recalculated.getWorksheet("Trading Comps")!;
      const rowOf = (label: string) => {
        let n = -1;
        k.eachRow((row, i) => {
          if (n < 0 && row.getCell(1).value === label) n = i;
        });
        return n;
      };
      const res = (r: number, c: number) =>
        (k.getCell(r, c).value as Formula | null)?.result;
      console.log(
        "LibreOffice key cells:",
        JSON.stringify({
          targetEvEbitda: res(9, 11),
          medianEvEbitda: res(rowOf("Median"), 11),
          impliedPriceAtMedian: res(rowOf("Implied price (USD per share)"), 4),
        }),
      );
      expect(mismatches).toEqual([]);
      expect(compared).toBeGreaterThan(300);
    }, 180_000);
  },
);
