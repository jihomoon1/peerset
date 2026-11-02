import AxeBuilder from "@axe-core/playwright";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Request } from "@playwright/test";

// v1.1 "Fill prices" with the visitor's own Alpha Vantage key, in fixture mode.
// Alpha Vantage is mocked with page.route, so no test reaches the real service.
// Every test also listens to the network: the key must never appear in any request
// to PeerSet's own origin (docs/licensing.md, hard rule 1).

const KEY = "E2EKEY-0123456789";
const AV = "https://www.alphavantage.co/query**";
// LII's fixture peers: GGG, AAON, CARR and JCI (tests/fixtures/peer-index).
const CLOSES: Record<string, string> = {
  LII: "500.0000",
  GGG: "80.0000",
  AAON: "100.0000",
  CARR: "60.0000",
  JCI: "80.0000",
};
const DAILY_LIMIT = {
  Information:
    "We have detected your API key as [scrubbed] and our standard API rate limit is 25 requests per day. Please subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to instantly remove all daily rate limits.",
};

function series(symbol: string) {
  return {
    "Meta Data": { "2. Symbol": symbol, "3. Last Refreshed": "2026-10-23" },
    "Time Series (Daily)": {
      "2026-10-23": { "4. close": CLOSES[symbol] ?? "10.0000" },
      "2026-10-22": { "4. close": "1.0000" },
    },
  };
}

// Mocks Alpha Vantage. `limitAt` (1-based) answers that call and every later one
// with the daily-limit payload. Returns the symbols asked for, in order.
async function mockAlphaVantage(page: Page, limitAt?: number) {
  const asked: string[] = [];
  await page.route(AV, async (route) => {
    const url = new URL(route.request().url());
    const symbol = url.searchParams.get("symbol") ?? "";
    asked.push(symbol);
    expect(url.searchParams.get("apikey")).toBe(KEY);
    const body =
      limitAt !== undefined && asked.length >= limitAt
        ? DAILY_LIMIT
        : series(symbol);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    });
  });
  return asked;
}

// Hard rule 1: collects every request to PeerSet's origin, to check for the key.
function watchOwnOrigin(page: Page) {
  const own: Request[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).origin === "http://localhost:3000") own.push(r);
  });
  return async () => {
    for (const r of own) {
      const text = [
        r.url(),
        JSON.stringify(await r.allHeaders()),
        r.postData() ?? "",
      ].join("\n");
      expect(text, `request to ${r.url()}`).not.toContain(KEY);
    }
    return own.length;
  };
}

async function openLii(page: Page) {
  await page.goto("/c/LII");
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
}

const panel = (page: Page) =>
  page.getByRole("region", { name: "Price autofill" });

async function fill(page: Page, opts: { remember?: boolean } = {}) {
  await panel(page).getByLabel("Alpha Vantage key").fill(KEY);
  if (opts.remember)
    await panel(page).getByLabel("Remember on this device").check();
  await panel(page).getByRole("button", { name: "Fill prices" }).click();
}

const summary = (page: Page) => page.locator("[data-fill-summary]");

test("1. enter a key, Fill: every row fills from the user's own key", async ({
  page,
}) => {
  const check = watchOwnOrigin(page);
  const asked = await mockAlphaVantage(page);
  await openLii(page);
  await fill(page);
  await expect(summary(page)).toHaveText("Filled 5 of 5 prices.", {
    timeout: 20_000,
  });
  expect(asked).toEqual(["LII", "GGG", "AAON", "CARR", "JCI"]);
  await expect(page.getByLabel("LII price (USD)")).toHaveValue("500");
  await expect(page.getByLabel("CARR price (USD)")).toHaveValue("60");
  // Attribution on the as-of strip, and the URL carries the filled prices, never the key.
  await expect(page.locator("[data-attribution]")).toHaveText(
    "Prices: Alpha Vantage, fetched with your key · close of October 23, 2026",
  );
  expect(page.url()).toContain("pxav=");
  expect(page.url()).not.toContain(KEY);
  expect(await check()).toBeGreaterThan(0);
});

test("2. the daily-limit payload mid-way leaves a partial fill with its message", async ({
  page,
}) => {
  const check = watchOwnOrigin(page);
  const asked = await mockAlphaVantage(page, 4);
  await openLii(page);
  await fill(page);
  await expect(summary(page)).toHaveText(
    "Alpha Vantage's daily limit was reached; filled 3 of 5. Enter the rest by hand or try tomorrow.",
    { timeout: 20_000 },
  );
  expect(asked).toHaveLength(4); // nothing after the limit payload
  await expect(page.getByLabel("LII price (USD)")).toHaveValue("500");
  await expect(page.getByLabel("CARR price (USD)")).toHaveValue("");
  await check();
});

test("3. reloading the same day spends no Alpha Vantage calls (cache)", async ({
  page,
}) => {
  const check = watchOwnOrigin(page);
  const asked = await mockAlphaVantage(page);
  await openLii(page);
  await fill(page, { remember: true });
  await expect(summary(page)).toHaveText("Filled 5 of 5 prices.", {
    timeout: 20_000,
  });
  expect(asked).toHaveLength(5);

  // Reload without the prices in the URL, so every input is empty again.
  await openLii(page);
  // The remembered key is back; Fill again is served from today's saved closes.
  await expect(panel(page).getByLabel("Alpha Vantage key")).toHaveValue(KEY);
  await panel(page).getByRole("button", { name: "Fill prices" }).click();
  await expect(summary(page)).toHaveText("Filled 5 of 5 prices.");
  expect(asked).toHaveLength(5); // still 5: zero new calls
  await expect(page.getByLabel("JCI price (USD)")).toHaveValue("80");

  // "Forget key" removes the key and the saved closes from this browser.
  await panel(page).getByRole("button", { name: "Forget key" }).click();
  await expect(panel(page).getByLabel("Alpha Vantage key")).toHaveValue("");
  expect(
    await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.startsWith("peerset.")),
    ),
  ).toEqual([]);
  await check();
});

test("4. the key never appears in any request to PeerSet, export included", async ({
  page,
}) => {
  const check = watchOwnOrigin(page);
  await mockAlphaVantage(page);
  await openLii(page);
  await fill(page, { remember: true });
  await expect(summary(page)).toHaveText("Filled 5 of 5 prices.", {
    timeout: 20_000,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Excel" }).click();
  await download;
  await page.reload();
  await expect(page.getByText(/4 of 4 peers loaded/)).toBeVisible();
  const n = await check();
  expect(n).toBeGreaterThan(5); // page, peers, export and reload all checked
});

test("5. the export carries the Alpha Vantage attribution", async ({
  page,
}) => {
  await mockAlphaVantage(page);
  await openLii(page);
  await fill(page);
  await expect(summary(page)).toHaveText("Filled 5 of 5 prices.", {
    timeout: 20_000,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Excel" }).click();
  const file = await download;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    (await readFile(await file.path())) as unknown as ArrayBuffer,
  );
  expect(wb.getWorksheet("Trading Comps")!.getCell("A5").value).toBe(
    "Prices: Alpha Vantage via the user's own key, close of 2026-10-23; entered by the user's browser.",
  );
  const sources = JSON.stringify(
    wb.getWorksheet("Sources & Methodology")!.getSheetValues(),
  );
  expect(sources).toContain("Alpha Vantage via the user's own key");
});

test("6. axe: no serious or critical issues with the panel in use", async ({
  page,
}) => {
  await mockAlphaVantage(page, 3);
  await openLii(page);
  await fill(page);
  await expect(summary(page)).toContainText("daily limit", {
    timeout: 20_000,
  });
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
  ).toEqual([]);
});
