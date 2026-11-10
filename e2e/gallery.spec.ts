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

/**
 * The smaller copies only help if a browser actually chooses them, and that
 * depends on `sizes`, which no unit test can evaluate: it is CSS lengths
 * resolved against a real viewport and a real density. So each profile presses
 * all five orbs and holds two things for every painting hung:
 *
 * - no waste: the file chosen is never wider than the narrowest one that
 *   covers the drawn width at this density (Chromium may choose narrower still;
 *   that is its call, not a bug here);
 * - one download: the full-size `src` is never fetched first and then
 *   replaced by the copy the browser goes on to choose.
 */
const PROFILES = [
  { name: 'a 3× phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  { name: 'a 2× phone', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 },
  { name: 'a 1× desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
];

for (const profile of PROFILES) {
  test.describe(`gallery images on ${profile.name}`, () => {
    test.use({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor });

    test('downloads one file per painting, no wider than the drawing needs', async ({ page }) => {
      const fetched: string[] = [];
      page.on('request', (request) => {
        if (/\/gallery\/[^/]+\.webp$/.test(request.url())) {
          fetched.push(new URL(request.url()).pathname);
        }
      });
      await page.goto('/gallery');

      const image = page.locator('article img');
      const orbs = page.locator('button.orb');
      let previous = '';
      for (let index = 0; index < (await orbs.count()); index++) {
        fetched.length = 0;
        await orbs.nth(index).click();
        // Wait for this painting, not the last one: until the new srcset is
        // bound, the previous image is still complete and would pass alone.
        await expect
          .poll(() =>
            image.evaluate(
              (img: HTMLImageElement, before: string) =>
                img.srcset !== before && img.complete && img.naturalWidth > 0 && img.currentSrc,
              previous
            )
          )
          .toBeTruthy();
        previous = await image.evaluate((img: HTMLImageElement) => img.srcset);

        const { chosen, drawn, candidates } = await image.evaluate((img: HTMLImageElement) => ({
          chosen: new URL(img.currentSrc).pathname,
          drawn: img.getBoundingClientRect().width * window.devicePixelRatio,
          candidates: img.srcset.split(', ').map((entry) => {
            const [url, width] = entry.split(' ');
            return { url, width: parseInt(width, 10) };
          }),
        }));
        const enough =
          candidates.find((candidate) => candidate.width >= drawn) ?? candidates.at(-1);
        const picked = candidates.find((candidate) => candidate.url === chosen);

        expect(picked, `${chosen} is not in srcset`).toBeTruthy();
        expect(
          picked?.width,
          `${chosen} chosen for a drawing ${Math.round(drawn)}px wide; ${enough?.url} would do`
        ).toBeLessThanOrEqual(enough?.width ?? 0);
        expect(fetched, 'each painting should cost exactly one download').toEqual([chosen]);
      }
    });
  });
}

/**
 * The painting beside the words. In two columns the figure is `position:
 * sticky`, and that is only worth having if the whole of it, credit included,
 * is on screen while "Up close" is read. jsdom has no layout, so this is the
 * only place that can see it. The short window is the case that failed before
 * the height cap counted the frame and the credit: at 900×480 the credit ended
 * 3px below the screen for as long as the picture stuck.
 */
const DESKTOPS = [
  { name: 'a desktop', viewport: { width: 1440, height: 900 } },
  { name: 'a short window', viewport: { width: 900, height: 480 } },
];

for (const desktop of DESKTOPS) {
  test.describe(`gallery label on ${desktop.name}`, () => {
    test.use({ viewport: desktop.viewport });

    test('keeps the whole painting in view while "Up close" is read', async ({ page }) => {
      await page.goto('/gallery');
      const image = page.locator('article img');
      const orbs = page.locator('button.orb');
      let previous = '';
      for (let index = 0; index < (await orbs.count()); index++) {
        await orbs.nth(index).click();
        await expect
          .poll(() =>
            image.evaluate(
              (img: HTMLImageElement, before: string) =>
                img.srcset !== before && img.complete && img.naturalWidth > 0,
              previous
            )
          )
          .toBe(true);
        previous = await image.evaluate((img: HTMLImageElement) => img.srcset);

        const { title, top, bottom, height } = await page.evaluate(() => {
          const close = document.querySelectorAll('.hung-lenses dt')[1];
          window.scrollTo({
            top: close.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2,
            behavior: 'instant',
          });
          const figure = document.querySelector('.hung-frame')?.getBoundingClientRect();
          return {
            title: document.querySelector('#painting-title')?.textContent?.trim(),
            top: figure?.top ?? NaN,
            bottom: figure?.bottom ?? NaN,
            height: window.innerHeight,
          };
        });
        expect(top, `${title}: the painting scrolled away`).toBeGreaterThanOrEqual(0);
        expect(bottom, `${title}: the credit is below the screen`).toBeLessThanOrEqual(height);
      }
    });
  });
}

test.describe('gallery label in one column', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('lets the painting scroll with the label', async ({ page }) => {
    await page.goto('/gallery');
    await page.locator('button.orb').first().click();
    await expect(page.locator('.hung-frame')).toHaveCSS('position', 'static');
  });
});
