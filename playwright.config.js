// playwright.config.js
import { defineConfig } from '@playwright/test';

const isHeadless = process.env.HEADLESS !== 'false';

export default defineConfig({
  workers: 1, // run tests sequentially
  testDir: './tests',
  timeout: 60 * 1000,
  retries: 0,
  use: {
    headless: isHeadless,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure', // <- this enables screenshots on failure
    video: 'retain-on-failure',
    trace: 'retain-on-failure',   // optional: for detailed step tracing
  },
  reporter: [
    ['list'], // Keep console output
    ['allure-playwright'], // Add Allure reporter
    ['junit', { outputFile: 'test-results/results.xml' }]
  ],
});
