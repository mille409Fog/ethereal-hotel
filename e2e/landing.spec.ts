/**
 * Landing page smoke test.
 *
 * The narrow claim being made here is the one nothing else in the repo makes:
 * that the production bundle boots. Unit tests instantiate components against a
 * test harness, which proves the components work and says nothing about whether
 * `ng build` produced something a browser can run.
 */
import { expect, test } from '@playwright/test';

/** The nav, in the order it is laid out. */
const NAV_LINKS = ['Home', 'Projects', 'Experience', 'Contact'];

test.describe('landing page', () => {
  test('renders the hero', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Jacob Miller - Senior Software Engineer');

    const hero = page.locator('#home');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Jacob Miller');
    // Exact, because the availability line below names the same role.
    await expect(hero.getByText('Senior Software Engineer', { exact: true })).toBeVisible();

    // One primary action and two text links. The count is the composition:
    // three equal buttons asked a visitor to choose before telling them
    // anything, and a second `.btn` here is that layout coming back. The
    // reasoning is in the comment above the hero markup.
    await expect(hero.locator('.btn')).toHaveCount(1);
    await expect(hero.getByRole('link', { name: 'View My Work' })).toHaveAttribute(
      'href',
      '#projects'
    );
    await expect(hero.getByRole('link', { name: 'Read the case studies' })).toHaveAttribute(
      'href',
      '/work'
    );
    await expect(hero.getByRole('link', { name: 'Get in touch' })).toHaveAttribute(
      'href',
      '#contact'
    );

    // A direct way to write, on the first screen. Absent once `openTo` is
    // null, and this assertion should go with it.
    await expect(hero.getByRole('link', { name: /@/ })).toHaveAttribute(
      'href',
      /^mailto:[^@\s]+@[^@\s]+$/
    );
  });

  test('renders the primary navigation', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveText(NAV_LINKS);

    // Real `#hash` anchors, not JS handlers — asserted because the href is what
    // makes these work on middle click, on copy-link, and before hydration.
    for (const name of NAV_LINKS) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute(
        'href',
        `#${name.toLowerCase()}`
      );
    }
  });

  // 320 is the narrowest phone worth designing for, 375 the first width at
  // which the links take a second row, 390 and 430 the iPhones the bug was
  // photographed on. Before the fix the brand wrapped at all four and the
  // page scrolled sideways at 320, because the nav needed 360px.
  for (const width of [320, 375, 390, 430]) {
    test(`fits the navigation at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const nav = page.getByRole('navigation', { name: 'Primary' });
      await expect(nav).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

      // One line of text has one client rect; a wrapped brand has two.
      const brandLines = await nav.locator('.nav-brand').evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      });
      expect(brandLines).toBe(1);

      for (const link of await nav.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect((box?.x ?? -1) + (box?.width ?? Infinity)).toBeLessThanOrEqual(width);
      }
    });
  }

  test('boots without an uncaught runtime error', async ({ page }) => {
    // Both routes are lazily loaded, so a chunk that fails to resolve in the
    // production build — a broken `loadComponent`, a polyfill the bundler
    // dropped — surfaces here as an uncaught rejection and nowhere else. The
    // listener has to be attached before `goto` to catch errors thrown during
    // bootstrap, which are exactly the ones worth catching.
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));

    await page.goto('/');
    await expect(page.locator('#home')).toBeVisible();

    expect(errors.map((error) => error.message)).toEqual([]);
  });
});
