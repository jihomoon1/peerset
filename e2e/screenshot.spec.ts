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
