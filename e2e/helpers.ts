import type { Page } from "@playwright/test";

// Fixture mode pins the analysis date to 2026-10-26 (src/lib/fixtureMode.ts).
export const PRICE_DATE = "2026-10-26";

export async function enterPrice(page: Page, ticker: string, price: string) {
  await page.getByLabel(`${ticker} price (USD)`).fill(price);
  await page.getByLabel("Price date").fill(PRICE_DATE);
}

export function valuationRow(page: Page, label: string) {
  return page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: label, exact: true }),
  });
}
