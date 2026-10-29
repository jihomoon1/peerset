import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// M4b workbench specs 1–7 in fixture mode. LII's peers come from the fixture peer
// index (tests/fixtures/peer-index): GGG, AAON, CARR and JCI, the SIC 35 companies
// with frozen filings. JCI has no OperatingIncomeLoss (methodology §3), so its EV/EBITDA
// is Unsupported and left out of that column's statistics.

const PRICES = "LII, 500\nGGG\t80\nAAON, 100\nCARR, 60\nJCI, 80";

const table = (page: Page) =>
  page.getByRole("table", { name: /^Trading comps/ });
const nEvEbitda = (page: Page) =>
  page.getByRole("button", { name: /^n EV\/EBITDA: / });
const medianEvEbitda = (page: Page) =>
  page.getByRole("button", { name: /^Median EV\/EBITDA: / });

async function openLii(page: Page, query = "") {
  await page.goto(`/c/LII${query}`);
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
}

async function pastePrices(page: Page, text = PRICES) {
  await page.getByLabel(/^Paste prices/).fill(text);
  await page.getByRole("button", { name: "Apply" }).click();
}

test("1. LII: peers load, pasted prices fill the table, stats appear", async ({
  page,
}) => {
  await openLii(page);
  await expect(
    page.getByText(/^2-digit group 35 — fewer than 5 in group 358/),
  ).toBeVisible();
  await expect(medianEvEbitda(page)).toHaveAccessibleName(/: —\./);
  await pastePrices(page);
  await expect(page.getByLabel("CARR price (USD)")).toHaveValue("60");
  // GGG, AAON, CARR valid; JCI Unsupported.
  await expect(nEvEbitda(page)).toHaveAccessibleName(/: 3 \(1 excl\.\)\./);
  await expect(medianEvEbitda(page)).toHaveAccessibleName(/: \d+\.\dx\./);
  await expect(
    table(page).getByRole("button", { name: /^JCI LTM EBITDA: Unsupported/ }),
  ).toBeVisible();
});

test("2. remove a peer: stats update; restore it", async ({ page }) => {
  await openLii(page);
  await pastePrices(page);
  await expect(nEvEbitda(page)).toHaveAccessibleName(/: 3 \(1 excl\.\)\./);
  await page.getByRole("button", { name: "Remove CARR" }).click();
  await expect(nEvEbitda(page)).toHaveAccessibleName(/: 2 \(1 excl\.\)\./);
  await expect(
    table(page).getByRole("rowheader", { name: /CARRIER/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Restore CARR" }).click();
  await expect(nEvEbitda(page)).toHaveAccessibleName(/: 3 \(1 excl\.\)\./);
});

test("3. add TT: it appears with 'Added by you'", async ({ page }) => {
  await openLii(page);
  await page.getByLabel("Add a ticker").fill("tt");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added by you")).toBeVisible();
  await expect(
    table(page).getByRole("rowheader", { name: /Trane/i }),
  ).toBeVisible();
  await expect(page.getByText(/5 of 5 peers loaded/)).toBeVisible();
  // An unknown ticker never enters the table; its reason shows by the add box.
  await page.getByLabel("Add a ticker").fill("ZZZZZ");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/ZZZZZ can't be added/)).toBeVisible();
  await expect(table(page).getByRole("cell", { name: "ZZZZZ" })).toHaveCount(0);
});

test("4. a failing peer is isolated", async ({ page }) => {
  await page.route("**/api/fundamentals?ticker=CARR", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "SEC_UNAVAILABLE",
        message: "SEC is unavailable right now",
        retryable: true,
        requestId: "00000000-0000-0000-0000-000000000000",
      }),
    }),
  );
  await page.goto("/c/LII");
  await expect(page.getByText(/3 of 4 peers loaded; 1 failed/)).toBeVisible();
  await expect(
    table(page).getByText(/Failed to load: SEC is unavailable right now/),
  ).toBeVisible();
  await pastePrices(page);
  // GGG and AAON valid; JCI Unsupported; CARR failed.
  await expect(nEvEbitda(page)).toHaveAccessibleName(/: 2 \(2 excl\.\)\./);
  await expect(page.getByText(/SEC_UNAVAILABLE/)).toBeVisible();
  // The rest of the analysis is intact.
  await expect(
    page.getByRole("button", { name: /^Enterprise value: 18,809\.5/ }),
  ).toBeVisible();
});

test("5. sorting by EV/EBITDA keeps the target pinned", async ({ page }) => {
  await openLii(page);
  await pastePrices(page);
  const header = table(page).getByRole("columnheader", { name: /EV\/EBITDA/ });
  for (const direction of ["ascending", "descending"]) {
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", direction);
    const first = table(page).locator("tbody").first().getByRole("row").first();
    await expect(first).toContainText("Target");
  }
});

test("6. the URL round-trips the whole state on reload", async ({ page }) => {
  await openLii(page);
  await pastePrices(page);
  await page.getByRole("button", { name: "Remove CARR" }).click();
  await page.getByLabel("Add a ticker").fill("TT");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("TT price (USD)").fill("400");
  await expect(page).toHaveURL(/add=TT/);
  await expect(page).toHaveURL(/remove=CARR/);
  await expect(page).toHaveURL(/px=.*LII:500/);
  await expect(page).toHaveURL(/TT:400/);
  await expect(page).toHaveURL(/pxdate=2026-10-26/);

  await page.reload();
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
  await expect(page.getByLabel("LII price (USD)")).toHaveValue("500");
  await expect(page.getByLabel("TT price (USD)")).toHaveValue("400");
  await expect(
    page.getByRole("button", { name: "Restore CARR" }),
  ).toBeVisible();
  // CARR's price stays in the URL but isn't applied while it is removed.
  await expect(page).toHaveURL(/CARR:60/);
  await expect(page.getByLabel("CARR price (USD)")).toHaveCount(0);
});

test("7. axe: the full workbench has no serious or critical issues", async ({
  page,
}) => {
  await openLii(page);
  await pastePrices(page);
  await expect(nEvEbitda(page)).toHaveAccessibleName(/: 3 /);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
  ).toEqual([]);
});

test("mobile: regions stack and only the table scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLii(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  // Screen-reader-only text in cells is absolutely positioned; the table's scroll box
  // must be its containing block, or it widens the page (found by this test).
  expect(overflow).toBeLessThanOrEqual(0);
  const scroller = table(page).locator("xpath=..");
  const inner = await scroller.evaluate(
    (el) => el.scrollWidth > el.clientWidth,
  );
  expect(inner).toBe(true);
});
