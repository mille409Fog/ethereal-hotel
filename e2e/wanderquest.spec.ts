import { expect, test } from '@playwright/test';

/**
 * The half of the bonus map that jsdom cannot see: layout and hit-testing.
 *
 * The unit tests dispatch a click on the tile's square directly, so they
 * would pass even if the square took no clicks. An SVG fill of `none` takes
 * none, and a tile that was mostly water would then answer only on its
 * specks of land. So this clicks with a real pointer, in the water, at the
 * narrowest width the site supports, and measures each tile against WCAG
 * 2.5.8's 24 × 24 CSS pixels there.
 */
test.describe('wanderquest bonus map', () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test('gives every tile a target of at least 24 × 24 at 320px', async ({ page }) => {
    await page.goto('/wanderquest');
    const tiles = page.locator('svg.quest-bonus-map rect.quest-bonus-tile');
    await expect(tiles).toHaveCount(6);

    for (const tile of await tiles.all()) {
      const box = await tile.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    }
  });

  test("marks American Samoa from a click in its tile's water", async ({ page }) => {
    await page.goto('/wanderquest');
    const tile = page.locator('svg.quest-bonus-map g[data-id="AS"] rect.quest-bonus-tile');
    const checkbox = page.getByRole('checkbox', { name: 'American Samoa' });
    await expect(checkbox).not.toBeChecked();

    // The top-left corner of the square: open sea, nowhere near the islands.
    await tile.click({ position: { x: 4, y: 4 } });
    await expect(checkbox).toBeChecked();
    await expect(page.locator('svg.quest-bonus-map path[data-id="AS"]')).toHaveClass(
      /quest-visited/
    );
  });
});
