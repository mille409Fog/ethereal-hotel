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

/**
 * The unit tests hold the class and the rule; jsdom cannot resolve the custom
 * property behind it, so this reads the fill a real browser paints.
 */
test.describe('wanderquest checklist', () => {
  test("fills a state with the panel's highlight from its row, by pointer and by keyboard", async ({
    page,
  }) => {
    await page.goto('/wanderquest');
    const ohio = page.locator('svg.quest-outline path[data-id="OH"]');
    const fill = (): Promise<string> => ohio.evaluate((path) => window.getComputedStyle(path).fill);
    const highlight = await page
      .locator('#quest-panel-states')
      .evaluate((panel) =>
        window.getComputedStyle(panel).getPropertyValue('--quest-highlight').trim()
      );
    const resting = await fill();
    // `--quest-highlight` is six-digit hex; the computed fill is rgb().
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(highlight.slice(at, at + 2), 16));
    const lit = `rgb(${r}, ${g}, ${b})`;
    expect(resting).not.toBe(lit);

    // The label, not the text: the shape's own <title> also says "Ohio".
    await page.locator('#quest-panel-states label', { hasText: /^Ohio$/ }).hover();
    await expect.poll(fill).toBe(lit);
    await page.mouse.move(0, 0);
    await expect.poll(fill).toBe(resting);

    await page.getByRole('checkbox', { name: 'Ohio' }).focus();
    await expect.poll(fill).toBe(lit);
  });
});
