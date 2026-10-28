import { defineConfig, devices } from "@playwright/test";

// Production smoke test (M3): runs against the live site at PEERSET_URL.
const baseURL = process.env.PEERSET_URL;
if (!baseURL) throw new Error("Set PEERSET_URL to the production URL");

export default defineConfig({
  testDir: "e2e/smoke",
  retries: 1,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
