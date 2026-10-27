import { expect, test } from "@playwright/test";

// M3 spec 6: search, open a drawer, close it and enter a price with the keyboard only.

async function tabTo(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
  max = 60,
) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`could not reach ${target} by Tab`);
}

test("keyboard only: search, drawer, price", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Ticker", exact: true });
  await tabTo(page, search);
  await page.keyboard.type("lii");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/c\/LII$/);

  const cell = page.getByRole("button", {
    name: /^EBITDA \(standardized, unadjusted\): .*Show calculation/,
  });
  await tabTo(page, cell);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "EBITDA (standardized, unadjusted)",
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(cell).toBeFocused();

  const price = page.getByLabel("LII price (USD)");
  await tabTo(page, price);
  await page.keyboard.type("500");
  await expect(price).toHaveValue("500");
  await expect(
    page.getByRole("button", {
      name: /^Enterprise value: [\d,]+\.\d\. Show EV bridge/,
    }),
  ).toBeVisible();
});
