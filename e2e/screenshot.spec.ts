import { expect, test } from "@playwright/test";
import { enterPrice } from "./helpers";

// The README image (M3): /c/LII on the frozen Q2 fixture, priced at an illustrative
// 500, with the EBITDA drawer open. Run with SCREENSHOT=1 npm run e2e -- screenshot.
test.skip(!process.env.SCREENSHOT, "set SCREENSHOT=1 to refresh docs/images");

test("README screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/c/LII");
  await enterPrice(page, "LII", "500");
  await page
    .getByRole("button", { name: /^EBITDA \(standardized, unadjusted\): / })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "docs/images/lii-ebitda-drawer.png" });
});

// The mobile image (M6): the LII workbench at 375 px, priced, peers loaded.
test("mobile screenshot, 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/c/LII");
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
  await enterPrice(page, "LII", "500");
  await page.locator("body").click({ position: { x: 1, y: 1 } }); // close the date picker focus
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/images/2026-11-01_mobile-375.png",
    fullPage: false,
  });
});
