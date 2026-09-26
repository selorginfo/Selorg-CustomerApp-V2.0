import { defineConfig } from "@playwright/test";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:3333";

/**
 * Customer-app automation audit — hits real selorg-service customer APIs.
 * Does not start servers; expects backend already running.
 *
 * Native Detox/Maestro UI E2E is not configured in this repo; user flows are
 * covered as real-backend API journeys matching frontend service contracts.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/playwright-report.json" }],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results/artifacts",
  use: {
    baseURL: API_BASE,
    trace: "on-first-retry",
    extraHTTPHeaders: {
      Accept: "application/json",
    },
  },
  projects: [
    {
      name: "api",
      testMatch: /api\/.*\.spec\.ts/,
    },
    {
      name: "flows",
      testMatch: /flows\/.*\.spec\.ts/,
    },
  ],
  metadata: {
    apiBaseUrl: API_BASE,
    customerPrefix: "/api/v1/customer",
    app: "selorg-customer-app",
  },
});
