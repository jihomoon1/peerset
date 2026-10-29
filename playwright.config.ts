import { defineConfig, devices } from "@playwright/test";

// End-to-end tests in fixture mode (M3): the server answers SEC requests from
// tests/fixtures/sec, so these never call live SEC. Run `npm run build` first.
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["smoke/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  globalTimeout: 10 * 60_000,
  globalSetup: "./e2e/warmup.ts",
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    env: {
      PEERSET_SEC_FIXTURES: "1",
      PRICE_PROVIDER: "user",
      // One frozen filing per ticker, pinned so saving a newer fixture (LII Q3) never
      // changes what the e2e suite sees (M4a note).
      PEERSET_FIXTURE_ASOF:
        "AAON:2026Q2,CARR:2026Q2,GGG:2026Q3,JCI:2026Q2,LII:2026Q2,TT:2026Q2,WSO:2026Q2",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
