import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Playwright runs the accessibility audit (`e2e/a11y.spec.ts`) against the
 * **production build**, not `ng serve`. A dev build ships unminified CSS and
 * skips the production `fileReplacements`, so a dev-server scan can pass while
 * the artefact users actually load fails.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `node scripts/serve-dist.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
