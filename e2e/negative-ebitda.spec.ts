import { expect, test } from "@playwright/test";
import { enterPrice, valuationRow } from "./helpers";

// Negative-EBITDA fixture (M6, ADR 0004): Lucid Group (LCID), 10-Q for 2026-06-30.
// Golden: tests/golden/LCID-2026Q2*.json. At the test price 20.00, EV is
// 10,481,518,520 > 0, so EV/EBITDA is NM for "EBITDA ≤ 0" (methodology §10), not
// "EV ≤ 0"; LTM diluted EPS is (13.65), so P/E is NM for "EPS ≤ 0".

test("LCID priced: EV/EBITDA and P/E are NM with reasons; the negative margin is shown", async ({
  page,
}) => {
  await page.goto("/c/LCID");
  // (3,597,626,000) ÷ 1,547,122,000 = (232.54)%: shown even when negative.
  await expect(valuationRow(page, "EBITDA margin (%)")).toContainText(
    /\(232\.5/,
  );
  await enterPrice(page, "LCID", "20");
  const evEbitda = valuationRow(page, "EV / EBITDA (LTM)");
  await expect(evEbitda).toContainText("NM");
  await expect(evEbitda).toContainText("EBITDA ≤ 0");
  const pe = valuationRow(page, "P / E (LTM diluted)");
  await expect(pe).toContainText("NM");
  await expect(pe).toContainText("EPS ≤ 0");
  // 10,481,518,520 ÷ 1,547,122,000 = 6.7748, shown to one decimal.
  await expect(valuationRow(page, "EV / Revenue (LTM)")).toContainText("6.8x");
});

test("LCID added to LII's peers: its NM multiples are excluded from the statistics", async ({
  page,
}) => {
  await page.goto("/c/LII");
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
  await page.getByLabel("Add a ticker").fill("LCID");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/5 of 5 peers loaded/)).toBeVisible();
  await page
    .getByLabel(/^Paste prices/)
    .fill("LII, 500\nGGG, 80\nAAON, 100\nCARR, 60\nJCI, 80\nLCID, 20");
  await page.getByRole("button", { name: "Apply" }).click();
  const table = page.getByRole("table", { name: /^Trading comps/ });
  await expect(
    table.getByRole("button", {
      name: /^LCID EV\/EBITDA: NM \(NM: EBITDA ≤ 0/,
    }),
  ).toBeVisible();
  await expect(
    table.getByRole("button", { name: /^LCID P\/E: NM \(NM: EPS ≤ 0/ }),
  ).toBeVisible();
  // EV/EBITDA: GGG, AAON, CARR valid; JCI Unsupported and LCID NM excluded.
  await expect(
    page.getByRole("button", { name: /^n EV\/EBITDA: / }),
  ).toHaveAccessibleName(/: 3 \(2 excl\.\)\./);
  // P/E: GGG, AAON, CARR, JCI valid; LCID NM excluded.
  await expect(
    page.getByRole("button", { name: /^n P\/E: / }),
  ).toHaveAccessibleName(/: 4 \(1 excl\.\)\./);
});
