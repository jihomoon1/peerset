import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// M5 export in fixture mode: the comps-golden state (LII with CARR, AAON, TT, WSO and
// JCI), pasted prices, Export, then the downloaded file read back with ExcelJS. The
// expected values are tests/golden/comps-LII-2026Q2.json's.

const PRICES =
  "LII, 500\nCARR, 60\nAAON, 100\nTT, 400\nWSO, 450\nWSO-B, 450\nJCI, 80";

type Formula = ExcelJS.CellFormulaValue;
const result = (c: ExcelJS.Cell) => (c.value as Formula).result as number;

function rowLabeled(ws: ExcelJS.Worksheet, label: string): number {
  let found = -1;
  ws.eachRow((row, n) => {
    if (found < 0 && row.getCell(1).value === label) found = n;
  });
  return found;
}

test("export: the downloaded workbook carries the golden key cells", async ({
  page,
}) => {
  await page.goto("/c/LII?add=TT,WSO&remove=GGG");
  await expect(page.getByText(/5 of 5 peers loaded/)).toBeVisible();
  const button = page.getByRole("button", { name: "Export to Excel" });
  await expect(button).toBeEnabled();

  await page.getByLabel(/^Paste prices/).fill(PRICES);
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByLabel("Price date").fill("2026-10-23");
  await expect(page.getByLabel("WSO-B price (USD)")).toHaveValue("450");

  const download = page.waitForEvent("download");
  await button.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("PeerSet_LII_comps_2026-10-26.xlsx");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    (await readFile(await file.path())) as unknown as ArrayBuffer,
  );
  const ws = wb.getWorksheet("Trading Comps")!;
  const K = 11; // EV/EBITDA column
  // Target EV/EBITDA: 18,809,537,500 ÷ 1,164,900,000 = 16.1469x.
  expect(result(ws.getCell(9, K))).toBeCloseTo(16.146911752081724, 9);
  // Peer median EV/EBITDA: (20.8708 + 24.8450) ÷ 2 = 22.8579x.
  expect(result(ws.getCell(rowLabeled(ws, "Median"), K))).toBeCloseTo(
    22.857904556948977,
    9,
  );
  // Implied price at the median EV/EBITDA: 726.20.
  expect(
    result(ws.getCell(rowLabeled(ws, "Implied price (USD per share)"), 4)),
  ).toBeCloseTo(726.2003134600196, 6);
});

test("the Export button sits in the header and enables once peers load", async ({
  page,
}) => {
  await page.goto("/c/LII");
  const button = page
    .getByRole("banner")
    .getByRole("button", { name: "Export to Excel" });
  await expect(button).toBeVisible();
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
  await expect(button).toBeEnabled();
});
