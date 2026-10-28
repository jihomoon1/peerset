import { expect, test } from "@playwright/test";

// Live production checks: presence and shape only, never specific values, since
// they change with every new filing. LII only.

test("home page loads", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole("search", { name: "Ticker", exact: true }),
  ).toBeVisible();
});

test("LII: LTM revenue, filing link, and EV/EBITDA at price 500", async ({
  page,
}) => {
  const res = await page.goto("/c/LII");
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole("button", {
      name: /^Revenue: [\d,]+\.\d\. Show calculation/,
    }),
  ).toBeVisible();

  // The drawer links the filing by accession on sec.gov.
  await page.getByRole("button", { name: /^Revenue: / }).click();
  const dialog = page.getByRole("dialog", { name: "Revenue" });
  const filing = dialog
    .locator('a[href*="sec.gov/Archives/edgar/data/"]')
    .first();
  await expect(filing).toHaveText(/^\d{10}-\d{2}-\d{6}$/);
  await page.keyboard.press("Escape");

  await page.getByLabel("LII price (USD)").fill("500");
  const evEbitda = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "EV / EBITDA (LTM)",
      exact: true,
    }),
  });
  await expect(evEbitda.getByRole("cell").first()).toHaveText(
    /^\d[\d,]*\.\dx$/,
  );
});
