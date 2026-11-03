import { expect, test, type Locator, type Page } from '@playwright/test';

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

    // The label, not the text: the caption under the map says "Ohio" too.
    await page.locator('#quest-panel-states label', { hasText: /^Ohio$/ }).hover();
    await expect.poll(fill).toBe(lit);
    await page.mouse.move(0, 0);
    await expect.poll(fill).toBe(resting);

    await page.getByRole('checkbox', { name: 'Ohio' }).focus();
    await expect.poll(fill).toBe(lit);
  });
});

/**
 * The caption under each outline, with what jsdom cannot give it: a real
 * pointer's hit-testing, a real tap's event order, and layout.
 */
test.describe('wanderquest caption', () => {
  const caption = (page: Page, svg: string): Locator =>
    page.locator(`${svg} + p.quest-outline-caption`);
  const statesMap = '#quest-panel-states svg.quest-outline';

  test('names the place under a mouse at once, and empties when it leaves', async ({ page }) => {
    await page.goto('/wanderquest');
    await page.locator(`${statesMap} path[data-id="TX"]`).hover();
    await expect(caption(page, statesMap)).toHaveText('Texas — not yet visited');

    await page.locator(`${statesMap} path[data-id="TX"]`).click();
    await expect(caption(page, statesMap)).toHaveText('Texas — visited');

    await page.mouse.move(0, 0);
    await expect(caption(page, statesMap)).toHaveText('');
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true, viewport: { width: 375, height: 800 } });

    test('names the place a tap toggled, so the tap has a visible answer', async ({ page }) => {
      await page.goto('/wanderquest');
      await page.locator(`${statesMap} path[data-id="TX"]`).tap();
      await expect(page.getByRole('checkbox', { name: 'Texas' })).toBeChecked();
      await expect(caption(page, statesMap)).toHaveText('Texas — visited');
    });
  });

  /**
   * The longest caption on the page is the United Kingdom's. Lit from its
   * checklist row, it must fit the height the line holds while empty, at the
   * narrowest width the site supports, either side of the stylesheet's 40rem
   * step, and on a desktop; otherwise the page jumps under the pointer.
   */
  for (const width of [320, 639, 640, 1280]) {
    test(`reserves the longest caption's height while empty at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/wanderquest');
      await page.getByRole('tab', { name: 'Countries' }).click();
      const world = '#quest-panel-countries svg.quest-outline:not(.quest-outline-inset)';
      const line = caption(page, world);
      await expect(line).toHaveText('');
      const empty = (await line.boundingBox())?.height;

      // The whole list is behind a closed disclosure; the search is the way in.
      await page.getByRole('searchbox', { name: 'Find a country' }).fill('united kingdom');
      await page
        .getByRole('checkbox', { name: 'United Kingdom of Great Britain and Northern Ireland' })
        .focus();
      await expect(line).toHaveText(
        'United Kingdom of Great Britain and Northern Ireland — not yet visited'
      );
      expect((await line.boundingBox())?.height).toBe(empty);
    });
  }
});
