import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Playwright runs every suite here — the smoke tests (`landing`, `dashboard`)
 * and the accessibility audit (`a11y`) — against the **production build**, not
 * `ng serve`. A dev build ships unminified CSS and skips the production
 * `fileReplacements`, so a dev-server run can pass while the artefact users
 * actually load fails. It also means the smoke tests exercise the lazy chunks
 * and the production API URLs, which is the whole point of running them.
 *
 * `npm run e2e` builds and runs all of it; `npm run a11y` scopes to the audit.
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
