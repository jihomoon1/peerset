// Writes the comps-golden workbook (LII with CARR, AAON, TT, WSO and JCI at the
// golden test prices) from the frozen fixtures, for the LibreOffice recalculation
// check in CI and for opening by hand. Never calls SEC.
//
//   npx tsx scripts/export-golden-workbook.ts --out output/comps-golden.xlsx [--strip-results]
//
// --strip-results writes every formula without its cached result, so a spreadsheet
// that opens it must calculate each one itself (ADR 0010).

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type ExcelJS from "exceljs";
import { buildWorkbook } from "@/export/workbook";
import { loadExportSnapshot } from "@/lib/exportSnapshot";
import { fixtureDeps, GOLDEN_REQUEST } from "../tests/helpers/exportFixture";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    "strip-results": { type: "boolean", default: false },
  },
});
const out: string = values.out ?? "";
if (!out) throw new Error("--out <file.xlsx> is required");

async function main() {
  const snapshot = await loadExportSnapshot(GOLDEN_REQUEST, fixtureDeps());
  const wb = buildWorkbook(snapshot);
  if (values["strip-results"])
    for (const ws of wb.worksheets)
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          const v = cell.value;
          if (v && typeof v === "object" && "formula" in v && v.formula)
            cell.value = { formula: v.formula } as ExcelJS.CellFormulaValue;
        }),
      );
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  writeFileSync(out, buffer);
  console.log(`wrote ${out} (${buffer.byteLength} bytes)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
