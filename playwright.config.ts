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
    env: { PEERSET_SEC_FIXTURES: "1", PRICE_PROVIDER: "user" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
