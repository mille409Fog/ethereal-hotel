import { expect, test } from '@playwright/test';
import { stubBackendDown } from './support/backend';

/**
 * The way back from every route a project card opens, measured where jsdom
 * cannot: on the first screen, in a real layout, at a desktop and a phone
 * width. The unit test proves the component's markup; only a browser can say
 * the link is above the fold rather than merely present.
 *
 * Not `/aubade` or `/aubade/reader`: that work shares nothing with this one.
 * Nothing here checks that it stays absent, because it cannot arrive:
 * `check:docs` fails on any import from `src/app/` inside `src/aubade/`, and
 * the component lives in `src/app/`.
 */
const ROUTES = [
  '/dashboard',
  '/booking',
  '/work',
  '/gallery',
  '/aesthetic',
  '/wanderquest',
  '/murmuration',
] as const;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

test.describe('home link', () => {
  // Down rather than up: what the API says is beside the point here, and a
  // refused request settles faster than one left to time out.
  test.beforeEach(async ({ page }) => {
    await stubBackendDown(page);
  });

  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route} reaches home from the first screen at ${viewport.name} width`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route);

        const link = page
          .getByRole('navigation', { name: 'Site' })
          .getByRole('link', { name: 'Jacob Miller' });
        await expect(link).toHaveAttribute('href', '/');
        await expect(link).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      });
    }
  }

  test('/murmuration keeps the whole viewport for its canvas', async ({ page }) => {
    await page.goto('/murmuration');
    const canvas = page.locator('app-murmuration canvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toEqual({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
    // The link floats over the canvas; the page itself must not grow a scroll.
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
    ).toBe(true);
  });

  test('following it from a demo lands on the home page', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link').click();

    await expect(page).toHaveURL('/');
    await expect(page.locator('#main-content')).toBeVisible();
  });
});
