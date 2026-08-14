import { expect, test, type Page } from '@playwright/test';

/**
 * `/aubade` smoke test — the only check that runs the whole stack in a browser.
 *
 * Everything else about this route is tested one layer at a time and none of
 * those layers can see the others. The unit tests drive a stub GL context that
 * never reads a shader. `npm run verify:shader` compiles the real shaders but
 * builds its own canvas and never loads the app. Neither would notice a broken
 * lazy chunk, a component that fails to reach `ngAfterViewInit`, or a canvas
 * that ends up laid out at zero pixels — which are between them most of the
 * ways this page can be broken while every other gate stays green.
 *
 * ## Why almost everything here runs under reduced motion
 *
 * Headless Chromium has no GPU: it renders WebGL2 through SwiftShader, which is
 * a CPU rasteriser. A full-speed raymarch at 1280×720 therefore pegs a core, and
 * Playwright runs ten workers in parallel — so leaving the loop running in these
 * specs starved the entire suite and timed out unrelated dashboard and booking
 * tests. It looked exactly like a flaky CI box and was entirely self-inflicted.
 *
 * Reduced motion draws one frame and stops, which is all most of these
 * assertions need. The two that genuinely have to watch the loop run say so, and
 * use a small viewport so the cost is a fraction of a core rather than all of
 * one. None of this weakens the tests: the interesting question is whether a
 * frame reaches the canvas, not how many.
 */

/** The plate stops saying this once the renderer chunk has resolved. */
async function waitForTheLobby(page: Page): Promise<void> {
  await expect(page.getByText('Unlocking the lobby')).toBeHidden();
}

/** Open the route with the camera held still — see the file comment. */
async function openStill(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/aubade');
  await waitForTheLobby(page);
}

test.describe('the aubade route', () => {
  test('renders the lobby', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/aubade');
    await expect(page).toHaveTitle('Hôtel Aubade - Floor 0, The Desk');

    await waitForTheLobby(page);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // The drawing buffer, not the CSS box. `canvas.width` stays at its default
    // 300×150 until the renderer sizes it, so this is the assertion that says a
    // frame was actually drawn rather than an element merely being present.
    const buffer = await canvas.evaluate((element: HTMLCanvasElement) => ({
      width: element.width,
      height: element.height,
    }));
    expect(buffer.width).toBeGreaterThan(400);
    expect(buffer.height).toBeGreaterThan(300);

    expect(errors).toEqual([]);
  });

  test('reaches the real renderer, not the text fallback', async ({ page }) => {
    await openStill(page);

    // If this starts failing on CI, check whether the runner still has a
    // working GL stack before changing anything here — the fallback is correct
    // behaviour and this test exists to notice when it is being taken.
    await expect(page.getByText('no WebGL2')).toBeHidden();
  });

  test('writes the room out in prose, alongside the canvas and not instead of it', async ({
    page,
  }) => {
    // AUBADE's first non-negotiable in embryo: the text version is not a
    // fallback that appears when something fails, it is the work in its other
    // form and it is always on the page.
    await openStill(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hôtel Aubade');
    await expect(page.getByText(/transom/)).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('the cue scrolls to the prose instead of leaving the piece', async ({ page }) => {
    // This is here because it has already gone wrong once, in a way no other
    // gate could see. `src/index.html` sets `<base href="/">`, so a
    // fragment-only href resolves against the base rather than the current URL
    // — `#lobby-prose` became `/#lobby-prose` and quietly navigated to the home
    // page. Everything still rendered; it was just the wrong page.
    await openStill(page);

    await page.getByRole('link', { name: /The room, in words/ }).click();

    await expect(page).toHaveURL(/\/aubade#lobby-prose$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hôtel Aubade');

    // Focus, not just scroll: a same-page link that only scrolls strands a
    // keyboard user's focus back in the plate, so the next Tab resumes there.
    await expect(page.locator('#lobby-prose')).toBeFocused();
  });

  test('is reachable from the portfolio', async ({ page }) => {
    // A route nothing links to is a route nobody finds. The link is in the
    // footer rather than the nav on purpose — see footer.html.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: 'Hôtel Aubade' }).click();

    await expect(page).toHaveURL(/\/aubade$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hôtel Aubade');
  });
});

/**
 * The two tests that have to watch the loop, at a viewport small enough that a
 * CPU rasteriser can keep up. They are a pair on purpose: one asserts the room
 * moves, the other that it does not, and either alone would pass against a
 * renderer that had quietly stopped drawing.
 */
test.describe('the camera', () => {
  test.use({ viewport: { width: 420, height: 280 } });

  test('breathes when motion is allowed', async ({ page }) => {
    // End to end, this is the assertion that the fixed-step accumulator, the
    // drift function and the uniform upload are all wired to each other: if any
    // of the three is inert, consecutive frames are identical.
    await page.goto('/aubade');
    await waitForTheLobby(page);

    const canvas = page.locator('canvas');
    const first = await canvas.screenshot();
    await page.waitForTimeout(1200);
    const second = await canvas.screenshot();

    expect(Buffer.compare(first, second)).not.toBe(0);
  });

  test('holds still under prefers-reduced-motion', async ({ page }) => {
    // Honoured at the concept level: not a slower camera, no camera.
    await openStill(page);

    await expect(page.getByText('holding its breath')).toBeVisible();

    const canvas = page.locator('canvas');
    const first = await canvas.screenshot();
    await page.waitForTimeout(1000);
    const second = await canvas.screenshot();

    expect(Buffer.compare(first, second)).toBe(0);
  });
});
