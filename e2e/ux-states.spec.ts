import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { enterPrice, valuationRow } from "./helpers";

// Blueprint §6 UX states (M6), in fixture mode. States tested elsewhere:
//   Metric is NM ............. e2e/negative-ebitda.spec.ts (LCID)
//   Export with missing values e2e/export.spec.ts ("Shown as text, not numbers")
//   Partial dataset usable ... e2e/workbench.spec.ts test 4 ("3 of 4 peers loaded; 1 failed")
// The rate-limited target uses PEERSET_FIXTURE_FAULTS="GM:429" (playwright.config.ts).

async function expectNoSeriousA11yIssues(page: Page) {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations
      .filter((v) => ["serious", "critical"].includes(v.impact!))
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
  ).toEqual([]);
}

// The page's own alert, not Next's empty route announcer (also role="alert").
const pageAlert = (page: Page) =>
  page.getByRole("alert").filter({ has: page.getByRole("heading") });

const homeSearch = (page: Page) =>
  page.getByRole("search", { name: "Ticker", exact: true });

async function lookUp(page: Page, ticker: string) {
  await page.goto("/");
  await homeSearch(page).getByLabel("Ticker", { exact: true }).fill(ticker);
  await homeSearch(page).getByRole("button", { name: "Look up" }).click();
}

const failedPeer = (status: number, code: string, message: string) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({
    code,
    message,
    retryable: true,
    requestId: "00000000-0000-0000-0000-000000000000",
  }),
});

test("§6 No ticker yet: search box, examples and a one-line explanation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    homeSearch(page).getByLabel("Ticker", { exact: true }),
  ).toBeVisible();
  for (const t of ["LII", "WSO", "GGG", "AAON"])
    await expect(
      page.getByRole("link", { name: t, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByText(/^Type a U\.S\. ticker and get first-pass trading comps/),
  ).toBeVisible();
});

test("§6 Invalid ticker: inline 'No SEC-registered company uses XYZQ'", async ({
  page,
}) => {
  await lookUp(page, "xyzq");
  await expect(
    homeSearch(page).getByText("No SEC-registered company uses XYZQ"),
  ).toBeVisible();
  // A malformed ticker is caught in the browser, before any request.
  await homeSearch(page).getByLabel("Ticker", { exact: true }).fill("LII$$");
  await homeSearch(page).getByRole("button", { name: "Look up" }).click();
  await expect(
    homeSearch(page).getByLabel("Ticker", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
});

test("§6 Valid, not analyzed: identity card with Analyze", async ({ page }) => {
  await lookUp(page, "lii");
  const card = page.getByRole("region", { name: /LENNOX INTERNATIONAL/i });
  await expect(card).toContainText("0001069202");
  await expect(card).toContainText(
    "10-Q for the period ended June 30, 2026, filed",
  );
  await expectNoSeriousA11yIssues(page);
  await card.getByRole("link", { name: "Analyze LII" }).click();
  await expect(page).toHaveURL(/\/c\/LII$/);
});

test("Two quick lookups never show the first ticker's card for the second (v1.1)", async ({
  page,
}) => {
  // LII's answer is held until WSO's card is on screen, then let through late.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/identity?ticker=LII", async (route) => {
    await held;
    await route.continue().catch(() => {}); // the browser may have aborted it
  });
  await lookUp(page, "lii");
  const input = homeSearch(page).getByLabel("Ticker", { exact: true });
  await input.fill("wso");
  await homeSearch(page).getByRole("button", { name: "Look up" }).click();
  const wso = page.getByRole("region", { name: /WATSCO/i });
  await expect(wso).toBeVisible();
  release();
  // Give the stale LII response time to arrive; the card must stay WSO's.
  await page.waitForTimeout(750);
  await expect(wso).toBeVisible();
  await expect(
    page.getByRole("region", { name: /LENNOX INTERNATIONAL/i }),
  ).toHaveCount(0);
});

test("§6 Target unsupported: the reason in one sentence and what PeerSet needs", async ({
  page,
}) => {
  // On the home card…
  await lookUp(page, "TM");
  await expect(page.getByRole("region", { name: /TOYOTA/i })).toContainText(
    "Not supported: Files 20-F annual reports; only 10-K and 10-Q filers are supported.",
  );
  // …and on the company page, which answers 404.
  const res = await page.goto("/c/TM");
  expect(res?.status()).toBe(404);
  const alert = pageAlert(page);
  await expect(
    alert.getByRole("heading", { name: "Company not supported" }),
  ).toBeVisible();
  await expect(alert).toContainText(
    "Files 20-F annual reports; only 10-K and 10-Q filers are supported",
  );
});

test("§6 Loading: the peer progress line names the filing being read", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/fundamentals?ticker=GGG", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/c/LII");
  // GGG's 10-Q for the quarter ended September 25, 2026 was filed October 21, 2026.
  await expect(
    page.getByText(/Reading GGG's 10-Q filed October 21, 2026…/),
  ).toBeVisible();
  release();
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
});

test("§6 Loading: the Analyze link names the target's filing while the page loads", async ({
  page,
}) => {
  await lookUp(page, "lii");
  const card = page.getByRole("region", { name: /LENNOX INTERNATIONAL/i });
  await expect(card.getByRole("link", { name: "Analyze LII" })).toBeVisible();
  // Hold the company page's server response so the wait is visible.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/c\/LII(\?|$)/, async (route) => {
    await held;
    await route.continue();
  });
  await card.getByRole("link", { name: "Analyze LII" }).click();
  await expect(
    card.getByText("Reading LII's 10-Q filed July 29, 2026…"),
  ).toBeVisible();
  release();
  await expect(page).toHaveURL(/\/c\/LII$/);
});

test("§6 SEC data incomplete: the value shows its status and reason; dependents withheld", async ({
  page,
}) => {
  // JCI has no OperatingIncomeLoss since 2016 (methodology §3).
  await page.goto("/c/JCI");
  await expect(
    page.getByRole("button", { name: /^Operating income: Unsupported/ }),
  ).toBeVisible();
  await enterPrice(page, "JCI", "80");
  const evEbitda = valuationRow(page, "EV / EBITDA (LTM)");
  await expect(evEbitda).toContainText("Unsupported");
  // Revenue-based values are still shown.
  await expect(valuationRow(page, "EV / Revenue (LTM)")).toContainText(/\dx/);
});

test("§6 Price missing: the price input is highlighted; valuation says Needs price", async ({
  page,
}) => {
  await page.goto("/c/LII");
  await expect(page.getByLabel("LII price (USD)")).toHaveAttribute(
    "placeholder",
    "Needs price",
  );
  await expect(valuationRow(page, "EV / EBITDA (LTM)")).toContainText(
    "Needs price",
  );
});

test("§6 A peer invalid: greyed row with its status, out of stats, listed under Excluded", async ({
  page,
}) => {
  await page.route("**/api/fundamentals?ticker=CARR", (route) =>
    route.fulfill(
      failedPeer(503, "SEC_UNAVAILABLE", "SEC is unavailable right now"),
    ),
  );
  await page.goto("/c/LII");
  await expect(page.getByText(/3 of 4 peers loaded; 1 failed/)).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: /^Trading comps/ })
      .getByText(/Failed to load: SEC is unavailable right now/),
  ).toBeVisible();
  const excluded = page.getByRole("region", { name: /^Excluded/ });
  await expect(excluded).toContainText("CARR");
});

test("§6 All peers filtered out: the message, the funnel counts and the add box", async ({
  page,
}) => {
  await page.goto("/c/WSO");
  await expect(page.getByText("No peers passed the screen.")).toBeVisible();
  await expect(page.getByLabel("Add a ticker")).toBeVisible();
});

test("§6 SEC rate-limited: the target's message", async ({ page }) => {
  await page.goto("/c/GM");
  const alert = pageAlert(page);
  await expect(
    alert.getByRole("heading", { name: "SEC is limiting requests" }),
  ).toBeVisible();
  await expect(alert).toContainText(
    "SEC is limiting requests; try again in about 10 minutes",
  );
  await expectNoSeriousA11yIssues(page);
});

test("§6 SEC rate-limited: a peer fails with the message; the others are kept", async ({
  page,
}) => {
  await page.route("**/api/fundamentals?ticker=AAON", (route) =>
    route.fulfill(
      failedPeer(
        429,
        "SEC_RATE_LIMITED",
        "SEC is limiting requests; try again in about 10 minutes",
      ),
    ),
  );
  await page.goto("/c/LII");
  await expect(page.getByText(/3 of 4 peers loaded; 1 failed/)).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: /^Trading comps/ })
      .getByText(/SEC is limiting requests; try again in about 10 minutes/),
  ).toBeVisible();
});

test("§6 Ticker changed: a shared link made for another CIK is not remapped", async ({
  page,
}) => {
  await page.goto("/c/LII?cik=0000000001&px=LII:500");
  const alert = pageAlert(page);
  await expect(
    alert.getByRole("heading", {
      name: "LII now maps to a different company",
    }),
  ).toBeVisible();
  await expect(alert).toContainText("This link was made for CIK 0000000001");
  await expect(alert).toContainText("(CIK 0001069202)");
  // No workbench, so no analysis is applied to the other company.
  await expect(page.getByLabel("LII price (USD)")).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);
});

test("§6 Ticker delisted: a shared link whose ticker SEC no longer lists", async ({
  page,
}) => {
  const res = await page.goto("/c/ZZZZZ?cik=0001069202");
  expect(res?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "ZZZZZ is no longer listed" }),
  ).toBeVisible();
});

test("a link that carries an analysis names its company's CIK", async ({
  page,
}) => {
  await page.goto("/c/LII");
  await enterPrice(page, "LII", "500");
  await expect(page).toHaveURL(/\?cik=0001069202&px=LII:500/);
});

test("axe: the full workbench, with the EV and statistics drawers", async ({
  page,
}) => {
  await page.goto("/c/LII");
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
  await page
    .getByLabel(/^Paste prices/)
    .fill("LII, 500\nGGG, 80\nAAON, 100\nCARR, 60\nJCI, 80");
  await page.getByRole("button", { name: "Apply" }).click();
  await expectNoSeriousA11yIssues(page);
  await page
    .getByRole("button", { name: /^Enterprise value: .*Show EV bridge/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Enterprise value bridge" }),
  ).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Median EV\/EBITDA: / }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("axe: LCID with NM multiples", async ({ page }) => {
  await page.goto("/c/LCID");
  await enterPrice(page, "LCID", "20");
  await expect(valuationRow(page, "EV / EBITDA (LTM)")).toContainText("NM");
  await expectNoSeriousA11yIssues(page);
});
