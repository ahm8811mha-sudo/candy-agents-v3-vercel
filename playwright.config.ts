import { defineConfig, devices } from "@playwright/test";

// Sandboxed environments ship a single system Chromium instead of the exact
// browser build this Playwright version pins. Point PW_CHROMIUM_PATH at it to
// run browser tests without downloading anything; CI leaves it unset.
const chromiumPath = process.env.PW_CHROMIUM_PATH;
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000/login",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: process.env,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "iphone", use: { ...devices["iPhone 13"], launchOptions } },
  ],
});
