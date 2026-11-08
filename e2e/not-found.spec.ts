import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * An unknown path, from the production build through the SPA fallback in
 * `scripts/serve-dist.mjs`, the same way Vercel's `/(.*)` rewrite serves it.
 *
 * Three shapes, because they failed the same way for slightly different
 * reasons before the `**` route existed: a typo at the top level, a real route
 * with a segment too many, and a real route in the wrong case (the router's
 * matching is case-sensitive). Each one used to throw NG04002 and leave a
 * blank page under `/`.
 */
const UNKNOWN = ['/dashbord', '/dashboard/extra', '/Booking'] as const;

test.describe('unknown path', () => {
  for (const path of UNKNOWN) {
    test(`${path} says it does not exist, and keeps the URL as typed`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('There is no page here');
      await expect(page.getByRole('main').locator('code')).toHaveText(path);
      await expect(page).toHaveURL(path);
      await expect(page).toHaveTitle('Page not found - Jacob Miller');
    });
  }

  test('its link goes home', async ({ page }) => {
    await page.goto('/dashbord');
    await page.getByRole('link', { name: 'Go to the home page' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('has no critical or serious axe violations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dashbord');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );
    expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
