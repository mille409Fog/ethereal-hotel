import { expect, test } from '@playwright/test';

/**
 * The half of `/gallery` that jsdom cannot see: the reproductions load.
 *
 * The unit tests assert the `src` an image is given; `scripts/gallery.test.mjs`
 * asserts the file is committed. Neither proves the built site serves
 * `public/gallery/` at the path the template asks for, and a mismatch there
 * renders a full label beside a broken image. So this presses an orb in a real
 * browser against the real build and checks the picture decoded.
 */
test.describe('gallery', () => {
  test('hangs a painting whose image actually loads', async ({ page }) => {
    await page.goto('/gallery');

    const orbs = page.locator('button.orb');
    await expect(orbs).toHaveCount(5);
    await orbs.first().click();

    const image = page.locator('article img');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('another painting of the same colour replaces the first', async ({ page }) => {
    await page.goto('/gallery');
    await page.locator('button.orb').first().click();

    const title = page.locator('#painting-title');
    const first = (await title.textContent())?.trim();
    await page.getByRole('button', { name: /^Another .* painting$/ }).click();
    await expect(title).not.toHaveText(first ?? '');
    await expect(page.locator('button.orb').first()).toHaveAttribute('aria-pressed', 'true');
  });
});
