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

  test('the lift reaches the floor below', async ({ page }) => {
    // The one end-to-end assertion that Floor −1 exists in a real browser. Every
    // other check on the corridor is blind to a different half of it: the unit
    // tests drive a stub context that never reads the shader, `verify:shader`
    // compiles the shader against its own canvas and never loads the app, and
    // `check:docs` reads the source without running any of it. A corridor that
    // threw on arrival, or a lift wired to a control the build tree-shook away,
    // would pass all three.
    //
    // Under reduced motion the descent is a cut rather than a seven-second morph
    // — see the file comment for why nothing here runs the loop if it can avoid
    // it — which is also the shortest way to stand in the corridor.
    //
    // Small viewport for the same reason the two camera tests use one. This draws
    // two frames rather than one, because arriving on a floor repaints the held
    // still, and both of them are a raymarch on a CPU rasteriser with nine other
    // workers wanting the same core.
    await page.setViewportSize({ width: 420, height: 280 });

    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));

    await openStill(page);

    const lift = page.getByRole('button', { name: /lift/i });

    // The hotel may be shut where CI is: the `?t=` back door is closed in a
    // production build, so the hour is whatever it happens to be. When it is,
    // the lift is disabled and the invitation is the way through — which is the
    // rule this route is built on, and worth asserting rather than skipping.
    if (!(await lift.isEnabled())) {
      await page.getByRole('button', { name: /Open the night rooms/ }).click();
    }

    await expect(lift).toBeEnabled();
    await lift.click();

    await expect(page.getByText('The Mirror Corridor')).toBeVisible();
    await expect(page.getByText(/wall made of mirror/)).toBeVisible();

    // Still a picture, and still described as one. The canvas is never torn down
    // and rebuilt across floors — the whole point of the lift being a uniform is
    // that the context outlives the descent.
    const label = await page.locator('canvas').getAttribute('aria-label');
    expect(label).toContain('corridor');
    expect(label).toContain('drawn in real time');

    // And the way back. A one-way lift is a room you cannot leave.
    await expect(page.getByRole('button', { name: /Take the lift up/ })).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test('is lit by whatever the sun is doing where the visitor is', async ({ page }) => {
    // The one end-to-end assertion that the clock reaches the room. It cannot
    // name an hour: this runs against a production build, where the dev-only
    // `?t=` back door is closed, so which of the five states CI gets depends on
    // when it ran. What every one of them shares is that the picture is
    // described as a picture — see `desk.ts` — and what none of them shares is
    // the description itself, so a hard-coded label here would fail twice a day.
    await openStill(page);

    const label = await page.locator('canvas').getAttribute('aria-label');
    expect(label).toContain('drawn in real time');
    expect(label).toContain('lobby');
  });

  test('carries a link to the Reader’s Edition on both of its screens', async ({ page }) => {
    // AUBADE's first non-negotiable: a visible link on every screen. The lobby
    // is deliberately two of them — the plate over the room, and the prose one
    // scroll down — so a single link at the bottom would satisfy the letter of
    // it and none of the point.
    await openStill(page);

    const links = page.getByRole('link', { name: /The Reader’s Edition/ });
    await expect(links).toHaveCount(2);

    await expect(links.first()).toBeVisible();
    await expect(links.first()).toHaveAttribute('href', '/aubade/reader');
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
 * `/aubade/reader` — the Reader's Edition.
 *
 * AUBADE's first non-negotiable and its own phase: the hotel as a prose work,
 * with a Definition of Done that is unusually checkable. Full keyboard path,
 * axe clean, readable at 200% zoom, and no WebGL context created on the route at
 * all. The axe half lives in `a11y.spec.ts`, which scans this route alongside
 * the other five; the rest is here.
 *
 * The no-context assertion is the one that could not be written anywhere else.
 * `reader.spec.ts` proves that mounting the component asks for nothing, and
 * `check:docs` proves that nothing in its import graph could — but neither can
 * see a real browser on a real page, where a stray canvas in a shared shell or a
 * router preloading the lobby's chunk would create one without any of this
 * project's source asking for it.
 */
/** Where the init script below parks its tally, on the page's own `window`. */
interface IContextLog {
  __contexts: string[];
}

test.describe('the reader’s edition', () => {
  /**
   * Count every `getContext` call the page makes, from before the first script
   * on it runs.
   *
   * `addInitScript` lands in the page ahead of Angular, so the patched
   * prototype method is the one every later caller finds. Recording on
   * `window` rather than in a Playwright binding keeps it synchronous, which
   * matters: a context can be created and released inside one microtask.
   */
  async function countContexts(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const asked: string[] = [];
      (window as unknown as IContextLog).__contexts = asked;

      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof original>
      ): ReturnType<typeof original> {
        asked.push(String(args[0]));
        return original.apply(this, args);
      };
    });
  }

  /** Read the log back out of the page. */
  const contexts = (page: Page): Promise<string[]> =>
    page.evaluate(() => (window as unknown as IContextLog).__contexts);

  test('creates no WebGL context, and no context of any other kind either', async ({ page }) => {
    await countContexts(page);
    await page.goto('/aubade/reader');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hôtel Aubade');

    // A beat, so a late chunk or a deferred init has somewhere to go wrong.
    await page.waitForTimeout(500);

    expect(await contexts(page)).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('is a real thing to read on its own', async ({ page }) => {
    // "Someone who reads only this has read a real thing." Not a claim a test
    // can make, but the floor under it is: the words are on the page, in the
    // hundreds, as text rather than as a picture of text.
    await page.goto('/aubade/reader');

    await expect(page).toHaveTitle("Hôtel Aubade - The Reader's Edition");
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hôtel Aubade');

    const words = await page.locator('main').innerText();
    expect(words.trim().split(/\s+/).length).toBeGreaterThan(1000);

    // The six floors, including the five that do not exist yet — and the
    // sentence that says which is which.
    await expect(page.getByText('The Mirror Corridor')).toBeVisible();
    await expect(page.getByText(/written and not built/)).toBeVisible();
  });

  test('says what the sun is doing, in words', async ({ page }) => {
    // The state cannot be named: this runs against a production build with the
    // `?t=` back door closed, so which hour CI gets depends on when it ran.
    // What every hour shares is the shape of the statement.
    await page.goto('/aubade/reader');

    const standing = page.locator('#standing');
    await expect(standing).toContainText('Your browser reports the time zone');
    await expect(standing).toContainText(/\d+\.\d degrees (above|below) that horizon/);
    await expect(standing).toContainText(/The sun (goes down|comes up)/);
  });

  test('has a keyboard path through the whole work', async ({ page }) => {
    await page.goto('/aubade/reader');

    // Every contents entry, by keyboard, in the order they are printed.
    const entries = await page.locator('.reader__contents a').allInnerTexts();
    expect(entries.length).toBeGreaterThan(5);

    await page.getByRole('link', { name: 'How the hour is decided' }).press('Enter');

    await expect(page).toHaveURL(/\/aubade\/reader#the-sun$/);
    // Focus, not just scroll: a jump that only scrolls strands a keyboard
    // user's focus back in the contents list.
    await expect(page.locator('#the-sun')).toBeFocused();
  });

  test('goes back to the lobby, and the lobby comes back here', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/aubade/reader');

    await page.getByRole('link', { name: 'Go up to the desk' }).click();
    await expect(page).toHaveURL(/\/aubade$/);
    await waitForTheLobby(page);

    await page
      .getByRole('link', { name: /The Reader’s Edition/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/aubade\/reader$/);
  });

  test('is readable at 200% zoom', async ({ page }) => {
    // A browser at 200% zoom halves the viewport's width in CSS pixels, which
    // is what the second viewport below is. Two things have to hold: the page
    // must not start scrolling sideways, and the type must not shrink — a font
    // size in `vw` gets *smaller* as a reader zooms in, which is the precise
    // opposite of what they asked for and passes every other check here.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/aubade/reader');

    const paragraph = page.locator('#the-sun p').first();
    const unzoomed = await paragraph.evaluate((node) => window.getComputedStyle(node).fontSize);

    await page.setViewportSize({ width: 640, height: 450 });
    const zoomed = await paragraph.evaluate((node) => window.getComputedStyle(node).fontSize);

    expect(zoomed).toBe(unzoomed);

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
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
