import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Sandboxes and dev containers often ship a preinstalled Chromium whose build
 * number differs from the one this Playwright version expects. Point
 * PLAYWRIGHT_CHROMIUM_PATH at it to reuse that binary instead of downloading.
 * CI leaves this unset and installs browsers normally.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const chromiumLaunch = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    // Parent app is mobile-first (UX_FLOW.md §1): 360px is the reference width.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 }, ...chromiumLaunch },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...chromiumLaunch } },
    // Worksheet print fidelity is checked in WebKit too (Phase 7).
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
