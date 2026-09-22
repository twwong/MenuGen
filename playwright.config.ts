import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
        extraHTTPHeaders: { "x-forwarded-for": "203.0.113.10" },
      },
    },
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 15"],
        extraHTTPHeaders: { "x-forwarded-for": "203.0.113.11" },
      },
    },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    env: {
      CREATOR_WORKFLOW_ENABLED: "true",
      CREATOR_BACKEND: "fixture",
    },
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:3100/create",
  },
});
