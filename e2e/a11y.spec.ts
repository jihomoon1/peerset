import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { enterPrice } from "./helpers";

// M3 spec 7: no serious or critical axe violations (blueprint §6 accessibility).
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  for (const v of results.violations)
    console.log(
      `[axe ${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`,
    );
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    }));
}

test("home page", async ({ page }) => {
  await page.goto("/");
  expect(await seriousViolations(page)).toEqual([]);
});

test("LII, priced", async ({ page }) => {
  await page.goto("/c/LII");
  await enterPrice(page, "LII", "500");
  await expect(
    page.getByRole("button", { name: /^Enterprise value: [\d,]+\.\d\./ }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("LII, open EBITDA drawer", async ({ page }) => {
  await page.goto("/c/LII");
  await page
    .getByRole("button", { name: /^EBITDA \(standardized, unadjusted\): / })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
