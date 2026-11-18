import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { LAND_PICTURES, landLine } from '../src/app/watershed/land-state';
import { HERO_SEED } from '../src/app/watershed/seed/seed';

/**
 * `/watershed` in a real browser: the four claims that jsdom cannot see,
 * because jsdom has no WebGL. The component's own spec drives a recording
 * renderer; this drives SwiftShader, which compiles every shader the route has
 * and draws them.
 *
 * Headless Chromium passes the float-target probe on SwiftShader, so a run
 * without reduced motion is the `simulating` state and runs a real storm, at
 * the lowest tier and a few frames a second. A run with it is `still`, the
 * stored land drawn once. Both states are exercised here and the third,
 * `stored`, is the component spec's: withholding `EXT_color_buffer_float` from
 * a real browser takes a patch to `getExtension` that would be testing the
 * patch.
 *
 * Nothing here compares a live land with stored bytes. Two machines do not
 * make the same land from one seed (`WATERSHED.md` §Traps), so the most a
 * browser test can hold of a storm is that one runs.
 */

/**
 * A storm on SwiftShader waits for the quality meter to settle on the empty
 * stage, then for its land to be raised in a worker, then compiles nine
 * simulation passes and the land's shaders before its first step. That came
 * to about ten seconds on this box; CI is three to five times slower, and the
 * budget is that and some.
 */
const STORM_TIMEOUT = 60_000;

/** The still frame waits only on the fetch, the decode and one frame. */
const STILL_TIMEOUT = 30_000;

/**
 * Console output that is not a failure of the route, each for a reason
 * `WATERSHED.md` records. The local server answers 404 for the analytics
 * script Vercel serves in production, and SwiftShader reports every read-back
 * — the float probe's, the readout's — as a GPU stall, as a warning.
 */
function isNoise(message: ConsoleMessage): boolean {
  return (
    message.location().url.includes('/_vercel/insights/') ||
    /GPU stall due to ReadPixels/.test(message.text())
  );
}

/** Every console error and uncaught exception on the page from now on. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !isNoise(message)) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * The darkest and brightest luma in a screenshot, out of 255. Decoded in the
 * page, as `project-frames.spec.ts` decodes its frames, because Node has no
 * image decoder and the suite adds no dependency for one.
 */
async function lumaRange(page: Page, png: Buffer): Promise<{ low: number; high: number }> {
  return page.evaluate(
    async (uri) => {
      const img = new window.Image();
      img.src = uri;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let low = 255;
      let high = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        low = Math.min(low, luma);
        high = Math.max(high, luma);
      }
      return { low, high };
    },
    `data:image/png;base64,${png.toString('base64')}`
  );
}

test.describe('the watershed route', () => {
  test('runs a storm with no console error', async ({ page }) => {
    test.setTimeout(STORM_TIMEOUT + 20_000);
    const errors = collectErrors(page);

    await page.goto('/watershed?seed=77');
    await expect(page.locator('app-watershed canvas')).toHaveAttribute('data-land', 'simulating');
    // The readout exists only once a storm has taken a step, which is after
    // every shader the storm draws with has compiled and run.
    await expect(page.locator('app-watershed .readout')).toBeVisible({ timeout: STORM_TIMEOUT });

    expect(errors).toEqual([]);
  });

  test('says under reduced motion that it shows one still frame, and draws one', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/watershed?seed=77');

    // The hero seed's land whatever the address says: a stored land is the
    // only one there is to show.
    await expect(page.locator('app-watershed .land-line')).toHaveText(
      landLine('still', HERO_SEED),
      { timeout: STILL_TIMEOUT }
    );
    await expect(page.getByRole('img', { name: LAND_PICTURES.still })).toBeVisible();
    // Nothing moves, so there is nothing to pause and no storm to start again.
    await expect(page.getByRole('button')).toHaveCount(0);

    // A canvas that compiled nothing and drew nothing is one flat colour, and
    // so is one whose every shader failed. The still frame has sky, cloud and
    // a land in shadow and sun, so its range is most of the scale.
    const range = await lumaRange(page, await page.locator('app-watershed canvas').screenshot());
    expect(range.high - range.low).toBeGreaterThan(64);
    expect(errors).toEqual([]);
  });

  test('New land draws a seed and writes it into the address', async ({ page }) => {
    await page.goto('/watershed?seed=77');
    const line = page.locator('app-watershed .land-line');
    await expect(line).toHaveText(landLine('simulating', 77));

    await page.getByRole('button', { name: 'New land' }).click();

    await expect(page).not.toHaveURL(/[?&]seed=77(&|$)/);
    const seed = new URL(page.url()).searchParams.get('seed');
    expect(seed).toMatch(/^\d+$/);
    // The address and the line name the same land, so a visitor can copy either.
    await expect(line).toHaveText(landLine('simulating', Number(seed)));
    expect(new URL(page.url()).pathname).toBe('/watershed');
  });
});
