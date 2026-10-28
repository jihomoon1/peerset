import { expect, test } from "@playwright/test";
import { enterPrice, valuationRow } from "./helpers";

// M3 specs 1–5, on the frozen LII Q2 and WSO Q2 fixtures.

test("home search goes to LII and shows LTM revenue", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("search", { name: "Ticker", exact: true });
  await search.getByLabel("Ticker", { exact: true }).fill("lii");
  await search.getByLabel("Ticker", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/c\/LII$/);
  await expect(
    page.getByRole("button", { name: /^Revenue: 5,302\.2\. Show calculation/ }),
  ).toBeVisible();
});

test("EBITDA drawer shows the LTM bridge; Esc returns focus", async ({
  page,
}) => {
  await page.goto("/c/LII");
  const cell = page.getByRole("button", {
    name: /^EBITDA \(standardized, unadjusted\): .*Show calculation/,
  });
  await cell.click();
  const dialog = page.getByRole("dialog", {
    name: "EBITDA (standardized, unadjusted)",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: /^LTM bridge/ }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(cell).toBeFocused();
});

test("price 500 gives EV/EBITDA 16.1x; EV drawer lists debt lines", async ({
  page,
}) => {
  await page.goto("/c/LII");
  await enterPrice(page, "LII", "500");
  // Golden: 18,809,537,500 ÷ 1,164,900,000 = 16.1469, shown to one decimal.
  await expect(valuationRow(page, "EV / EBITDA (LTM)")).toContainText("16.1x");
  await page
    .getByRole("button", { name: /^Enterprise value: .*Show EV bridge/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Enterprise value bridge" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Debt lines")).toBeVisible();
  await expect(dialog.getByText(/Commercial paper/i)).toBeVisible();
});

test("WSO has two price inputs and an Unsupported P/E", async ({ page }) => {
  await page.goto("/c/WSO");
  await expect(page.getByLabel(/^WSO price \(USD\)$/)).toBeVisible();
  await expect(page.getByLabel(/^WSO-B price \(USD\)$/)).toBeVisible();
  await enterPrice(page, "WSO", "400");
  await page.getByLabel("WSO-B price (USD)").fill("400");
  const pe = valuationRow(page, "P / E (LTM diluted)");
  await expect(pe).toContainText("Unsupported");
  await expect(pe).toContainText(/class/i);
});

test("an unknown ticker answers 404 and shows the error state", async ({
  page,
}) => {
  const res = await page.goto("/c/ZZZZZ");
  expect(res?.status()).toBe(404);
  const alert = page.getByRole("alert");
  await expect(
    alert.getByRole("heading", { name: "Unknown ticker" }),
  ).toBeVisible();
});
