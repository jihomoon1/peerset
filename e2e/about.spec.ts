import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the Why PeerSet tab opens the page, with no serious axe issues", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Why PeerSet" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Comps you can check/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Why the trail matters" }),
  ).toBeVisible();
  // The Carrier case: balance sheet lines against the filing's total-debt tag.
  await expect(
    page.getByRole("row", { name: /Balance sheet lines 11,952\.0/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Who it's for" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(bad.map((v) => v.id)).toEqual([]);
});
