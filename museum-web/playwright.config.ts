import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true';
const browsers = (process.env.PW_BROWSERS ?? 'chromium').split(',').map((s) => s.trim());

const projectFor = (name: string) => {
  if (name === 'firefox') return { name, use: { ...devices['Desktop Firefox'] } };
  if (name === 'webkit') return { name, use: { ...devices['Desktop Safari'] } };
  return { name: 'chromium', use: { ...devices['Desktop Chrome'] } };
};

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3001',
    storageState: 'e2e/playwright-storage/storageState.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: browsers.map(projectFor),
});
