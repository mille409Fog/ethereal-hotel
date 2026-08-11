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
const NAV_LINKS = ['Home', 'Projects', 'Experience', 'Skills', 'Contact'];

test.describe('landing page', () => {
  test('renders the hero', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Jacob Miller - Senior Software Engineer');

    const hero = page.locator('#home');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Jacob Miller');
    await expect(hero.getByText('Senior Software Engineer')).toBeVisible();

    // The two calls to action, which are the only interactive things in the
    // hero and the first thing a visitor is offered.
    await expect(hero.getByRole('link', { name: 'View My Work' })).toHaveAttribute(
      'href',
      '#projects'
    );
    await expect(hero.getByRole('link', { name: 'Get In Touch' })).toHaveAttribute(
      'href',
      '#contact'
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
