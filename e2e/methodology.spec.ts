import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// /methodology (M6 step 5): docs/methodology.md rendered on the site, with a plain-
// English summary, deep links from the comps table's column headers, and the footer.

test("the methodology page shows the summary and the full definitions", async ({
  page,
}) => {
  await page.goto("/methodology");
  await expect(
    page.getByRole("heading", { level: 1, name: "How PeerSet calculates" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "10. Multiples and the NM policy" }),
  ).toBeVisible();
  await expect(page.getByText(/Methodology version: 0\.4\.3/)).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((v) => ["serious", "critical"].includes(v.impact!)),
  ).toEqual([]);
});

test("the footer links to the methodology page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Methodology" })
    .click();
  await expect(page).toHaveURL(/\/methodology$/);
});

test("a column header's ? opens its methodology section", async ({ page }) => {
  await page.goto("/c/LII");
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
  await page.getByRole("link", { name: "How EV/EBITDA is calculated" }).click();
  await expect(page).toHaveURL(/\/methodology#10-multiples-and-the-nm-policy$/);
  await expect(
    page.locator(`[id="10-multiples-and-the-nm-policy"]`),
  ).toBeInViewport();
});

test("375 px wide: no sideways page scroll; wide tables scroll inside", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/methodology");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
