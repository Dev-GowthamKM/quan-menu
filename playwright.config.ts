import { defineConfig } from "@playwright/test";

// End-to-end acceptance tests. They run against a local Supabase (`npm run db:start`)
// and the bundled Razorpay mock, never against a live store: global setup refuses a
// non-local database. See README › Testing.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/e2e/report" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: "node tests/e2e/support/mock-razorpay.mjs", port: 4010, reuseExistingServer: true },
        { command: "npm run dev", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 240_000 },
      ],
});
