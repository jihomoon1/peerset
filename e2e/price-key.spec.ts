import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// /price-key: how to get a free Alpha Vantage key and use it to fill prices.

test("the footer opens the price-key guide, with no serious axe issues", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Get a price key" })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Get a free key to fill prices",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Get a key from Alpha Vantage" }),
  ).toHaveAttribute("href", "https://www.alphavantage.co/support/#api-key");
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Paste the key and press Fill prices" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(bad.map((v) => v.id)).toEqual([]);
});

test("the autofill box links to the guide", async ({ page }) => {
  await page.goto("/c/LII");
  await page
    .getByRole("region", { name: "Price autofill" })
    .getByRole("link", { name: "Step-by-step guide" })
    .click();
  await expect(page).toHaveURL(/\/price-key$/);
});
