/**
 * The frames on the home page's project cards, written and checked from the
 * production build.
 *
 *     npm run frames:capture    write public/projects/*.webp and the record
 *     npm run frames:check      fail if a committed frame has drifted
 *
 * `npm run e2e` runs the check too, because this file is in the suite. The
 * `resume:pdf` / `resume:check` pair is the precedent: one source, one
 * renderer, and a gate that fails when the committed output stops matching.
 * It is a spec rather than a script in `scripts/` because the frames need what
 * the suite already has — the built bundle on :4173 and the network stubs in
 * `support/backend.ts`, which Node alone cannot import.
 *
 * ## What the check compares, and why not the bytes
 *
 * Not the bytes, for the résumé's reason and then some: the encoder is lossy,
 * and text is rasterised differently on Windows and on the Linux CI image, so a
 * frame written on one machine could never match a render on the other.
 * Instead it holds three things, each as tightly as it can be held:
 *
 * - **the words**, exactly: the rendered text of the elements each frame is
 *   cropped around, recorded in `project-frames.json` when the frame is
 *   written. A changed figure, label or painting fails here and says which.
 * - **the crop**, to a few pixels: where those elements sit on the page. A
 *   layout change moves it. The slack is for sub-pixel differences in
 *   rounding, not for layout.
 * - **the picture, coarsely**: the committed WebP and a fresh render, each
 *   averaged down to a 32×20 grid and compared by mean channel difference. A
 *   restyle that leaves every word in place — the site changed its whole
 *   palette once — moves this; antialiasing and the codec do not.
 *
 * Every alt text is checked against the words as well: each figure in it and
 * each “quoted” phrase must appear in the frame, so a card cannot describe a
 * picture it no longer shows.
 *
 * ## Determinism
 *
 * Chance is seeded, so the gallery offers and hangs the same painting every
 * run; motion is reduced; the dashboard is served the committed fixture rather
 * than the test suite's altered figures; and focus is dropped before the shot so
 * no ring lands in a frame.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FRAME, PROJECTS } from '../src/app/projects/projects.data';
import { GUESTS, OFFLINE_DASHBOARD, ROOMS, stubBackendUp, stubBookingApi } from './support/backend';

/** The record sits beside this spec, in the test directory. */
const RECORD_NAME = 'project-frames.json';

/** 16:10, the shape of `FRAME`; every crop is widened or deepened to it. */
const ASPECT = FRAME.width / FRAME.height;

/** Room left around the anchors, in CSS pixels. */
const MARGIN = 24;

/** How far a recorded crop edge may move before it counts as a layout change. */
const CLIP_SLACK_PX = 4;

/** The comparison grid, 16:10 like the frames. */
const GRID = { width: 32, height: 20 } as const;

/**
 * Mean absolute difference per channel, out of 255, above which a fresh render
 * no longer looks like the committed frame. Measured on the machine that wrote
 * the frames: a fresh render against its own committed WebP reads 0.6 on all
 * four, and moving `--color-bg` from #1a2a25 to #22262e — a shift of ground
 * colour, every word unchanged — read 7.3 on the dashboard, 7.4 on the booking
 * form and 5.5 on the wheel. (The gallery read 1.3: its frame is mostly its own
 * palette, which this would catch instead.) So 3 sits five times above the
 * noise and under every restyle that was tried. The CI image rasterises text
 * differently from the box that wrote the frames; if its own reading on an
 * unchanged app ever nears this, that is the number to raise it from.
 */
const MAX_GRID_DIFFERENCE = 3;

/** WebP quality for `canvas.toDataURL`. */
const QUALITY = 0.82;

const VIEWPORT = { width: 1280, height: 800 } as const;

interface IClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What `project-frames.json` holds for each route. */
interface IFrameRecord {
  clip: IClip;
  text: string;
}

/** How to bring a route into the state its frame shows, and what to crop around. */
interface IRecipe {
  /** Elements whose union, fitted to 16:10, is the crop, and whose text is recorded. */
  readonly anchors: readonly string[];
  readonly prepare: (page: Page) => Promise<void>;
}

const RECIPES: Readonly<Record<string, IRecipe>> = {
  // Polling, the state a visitor to the deployed demo sees, over the committed
  // snapshot of the seeded hotel.
  '/dashboard': {
    anchors: ['.dashboard-header', '.metrics-region'],
    prepare: async (page) => {
      await stubBackendUp(page, [], OFFLINE_DASHBOARD);
      await page.goto('/dashboard');
      await expect(page.locator('.data-source--live')).toBeVisible();
      await expect(page.locator('.metric-card')).toHaveCount(6);
    },
  },
  // The route's whole argument: a rejection from the server, on its field.
  '/booking': {
    anchors: ['.booking-header', '.booking-form'],
    prepare: async (page) => {
      await stubBookingApi(page);
      await page.goto('/booking');
      await expect(page.locator('.data-source--live')).toBeVisible();
      await page.getByLabel('Room').selectOption(String(ROOMS[1].id));
      await page.getByLabel('Guest').selectOption(String(GUESTS[0].id));
      await page.getByLabel('Check-in').fill('2026-06-01');
      await page.getByLabel('Check-out').fill('2026-06-01');
      await page.getByRole('button', { name: 'Create booking' }).click();
      await expect(page.locator('#check_out-error')).toBeVisible();
    },
  },
  '/gallery': {
    anchors: ['.hung-frame', '#painting-title'],
    prepare: async (page) => {
      await page.goto('/gallery');
      await page.locator('button.orb').first().click();
      const image = page.locator('.hung-frame img');
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
        .toBeGreaterThan(0);
    },
  },
  '/aesthetic': {
    anchors: ['.wheel', '.wheel-caption'],
    prepare: async (page) => {
      await page.goto('/aesthetic');
      await page.locator('.cell[tabindex="0"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.triad-primary .triad-name')).toBeVisible();
    },
  },
};

/**
 * mulberry32, installed over `Math.random` before the app loads. Both random
 * routes draw through an injection token that defaults to `Math.random`, so
 * this pins them without the app knowing.
 */
function seedRandom(): void {
  let state = 0x2f6b1d;
  Math.random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The anchors' union in page coordinates, fitted to 16:10 by growing the short side. */
async function cropFor(page: Page, anchors: readonly string[]): Promise<IClip> {
  const boxes = await Promise.all(
    anchors.map((selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: r.left + window.scrollX,
            top: r.top + window.scrollY,
            right: r.right + window.scrollX,
            bottom: r.bottom + window.scrollY,
          };
        })
    )
  );
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  let left = Math.min(...boxes.map((b) => b.left)) - MARGIN;
  let top = Math.min(...boxes.map((b) => b.top)) - MARGIN;
  let width = Math.max(...boxes.map((b) => b.right)) + MARGIN - left;
  const height = Math.max(...boxes.map((b) => b.bottom)) + MARGIN - top;

  // The height returned is always derived from the width, so only the
  // vertical offset needs adjusting when it is the height that grows.
  if (width / height > ASPECT) {
    top -= (width / ASPECT - height) / 2;
  } else {
    const grown = height * ASPECT;
    left -= (grown - width) / 2;
    width = grown;
  }

  left = Math.min(Math.max(0, left), Math.max(0, pageWidth - width));
  return {
    x: Math.round(left),
    y: Math.round(Math.max(0, top)),
    width: Math.round(width),
    height: Math.round(width / ASPECT),
  };
}

/** The anchors' rendered text, whitespace collapsed. */
async function textOf(page: Page, anchors: readonly string[]): Promise<string> {
  const parts = await Promise.all(
    anchors.map((selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => (el instanceof HTMLElement ? el.innerText : (el.textContent ?? '')))
    )
  );
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Downscale a PNG to the frame size and encode it with Chromium's own WebP encoder. */
async function encode(encoder: Page, png: Buffer): Promise<Buffer> {
  const base64 = await encoder.evaluate(
    async ({ uri, width, height, quality }) => {
      const img = new window.Image();
      img.src = uri;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/webp', quality).split(',')[1];
    },
    { uri: `data:image/png;base64,${png.toString('base64')}`, ...FRAME, quality: QUALITY }
  );
  return Buffer.from(base64, 'base64');
}

/**
 * Decode the committed WebP and a fresh PNG, average both to `GRID`, and return
 * the committed file's dimensions and the mean channel difference between them.
 */
async function compare(
  encoder: Page,
  committed: Buffer,
  fresh: Buffer
): Promise<{ width: number; height: number; difference: number }> {
  return encoder.evaluate(
    async ({ committedUri, freshUri, grid }) => {
      const load = async (uri: string): Promise<HTMLImageElement> => {
        const img = new window.Image();
        img.src = uri;
        await img.decode();
        return img;
      };
      // A true box average over every pixel. `drawImage` straight to the grid
      // samples rather than averages at a reduction this steep, so a busy
      // picture aliased differently from two source sizes and the gallery read
      // 6/255 apart from its own re-encode.
      const average = (img: HTMLImageElement): Float64Array => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const sums = new Float64Array(grid.width * grid.height * 4);
        for (let y = 0; y < height; y++) {
          const row = Math.floor((y * grid.height) / height) * grid.width;
          for (let x = 0; x < width; x++) {
            const cell = (row + Math.floor((x * grid.width) / width)) * 4;
            const pixel = (y * width + x) * 4;
            sums[cell] += data[pixel];
            sums[cell + 1] += data[pixel + 1];
            sums[cell + 2] += data[pixel + 2];
            sums[cell + 3] += 1;
          }
        }
        return sums;
      };
      const a = await load(committedUri);
      const b = await load(freshUri);
      const pa = average(a);
      const pb = average(b);
      let sum = 0;
      let count = 0;
      for (let i = 0; i < pa.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          sum += Math.abs(pa[i + c] / pa[i + 3] - pb[i + c] / pb[i + 3]);
          count += 1;
        }
      }
      return { width: a.naturalWidth, height: a.naturalHeight, difference: sum / count };
    },
    {
      committedUri: `data:image/webp;base64,${committed.toString('base64')}`,
      freshUri: `data:image/png;base64,${fresh.toString('base64')}`,
      grid: GRID,
    }
  );
}

/** Figures and “quoted” phrases in an alt that are missing from the frame's text. */
function unsupportedClaims(alt: string, text: string): string[] {
  const figures = alt.match(/[#$]?[\d][\d.,%]*[\d%]|[#$]?\d/g) ?? [];
  const quoted = [...alt.matchAll(/“([^”]+)”/g)].map((m) => m[1]);
  return [...figures, ...quoted].filter((claim) => !text.includes(claim));
}

const FRAMED = PROJECTS.filter((project) => project.frame !== undefined);

test.describe('project frames', () => {
  test('every on-site route has a frame and a recipe, and nothing else does', () => {
    const routes = PROJECTS.map((project) => project.link).filter(
      (link): link is string => link !== undefined && /^\/[a-z-]+$/.test(link)
    );
    expect(FRAMED.map((project) => project.link)).toEqual(routes);
    expect(Object.keys(RECIPES).sort()).toEqual([...routes].sort());
  });

  test('the committed frames match the app', async ({ browser }) => {
    test.setTimeout(120_000);
    const writing = ['all', 'changed'].includes(test.info().config.updateSnapshots);
    // From Playwright's own resolved test directory rather than `__dirname`
    // or the working directory: absolute, and the same however it was run.
    const testDir = test.info().project.testDir;
    const REPO = path.resolve(testDir, '..');
    const RECORD_PATH = path.join(testDir, RECORD_NAME);

    let record: Record<string, IFrameRecord> = {};
    try {
      record = JSON.parse(await readFile(RECORD_PATH, 'utf8')) as Record<string, IFrameRecord>;
    } catch {
      expect(
        writing,
        `${path.relative(REPO, RECORD_PATH)} is missing. Run \`npm run frames:capture\`.`
      ).toBe(true);
    }

    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await context.addInitScript(seedRandom);
    const encoder = await context.newPage();

    try {
      for (const project of FRAMED) {
        const route = project.link ?? '';
        const frame = project.frame;
        const recipe = RECIPES[route];
        if (!frame || !recipe) continue;

        await test.step(route, async () => {
          const page = await context.newPage();
          await recipe.prepare(page);
          await page.evaluate(async () => {
            (document.activeElement as HTMLElement | null)?.blur();
            await document.fonts.ready;
          });

          const clip = await cropFor(page, recipe.anchors);
          const text = await textOf(page, recipe.anchors);
          const png = await page.screenshot({
            clip,
            fullPage: true,
            animations: 'disabled',
            caret: 'hide',
          });
          await page.close();

          const file = path.join(REPO, 'public', frame.src);
          const stale = `Run \`npm run frames:capture\` and commit ${path.relative(REPO, file)} with e2e/project-frames.json.`;

          expect
            .soft(
              unsupportedClaims(frame.alt, text),
              `The alt text for ${route} claims what its frame does not show. Frame text:\n${text}`
            )
            .toEqual([]);

          if (writing) {
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, await encode(encoder, png));
            record[route] = { clip, text };
            return;
          }

          const recorded = record[route];
          expect(recorded, `No record for ${route}. ${stale}`).toBeDefined();
          if (!recorded) return;

          expect
            .soft(text, `The words in the ${route} frame changed. ${stale}`)
            .toBe(recorded.text);
          for (const edge of ['x', 'y', 'width', 'height'] as const) {
            expect
              .soft(
                Math.abs(clip[edge] - recorded.clip[edge]),
                `The ${route} crop moved (${edge}: ${recorded.clip[edge]} → ${clip[edge]}), so the layout changed. ${stale}`
              )
              .toBeLessThanOrEqual(CLIP_SLACK_PX);
          }

          let committed: Buffer | undefined;
          try {
            committed = await readFile(file);
          } catch {
            expect
              .soft(committed, `${path.relative(REPO, file)} is missing. ${stale}`)
              .toBeDefined();
            return;
          }
          const result = await compare(encoder, committed, png);
          expect
            .soft(
              { width: result.width, height: result.height },
              `${frame.src} is not ${FRAME.width}×${FRAME.height}, the size the card reserves.`
            )
            .toEqual({ ...FRAME });
          expect
            .soft(
              result.difference,
              `The ${route} frame no longer looks like the app (mean difference ${result.difference.toFixed(2)}/255). ${stale}`
            )
            .toBeLessThanOrEqual(MAX_GRID_DIFFERENCE);
          test.info().annotations.push({
            type: 'frame difference',
            description: `${route}: ${result.difference.toFixed(2)}/255`,
          });
        });
      }
    } finally {
      await context.close();
    }

    if (writing) {
      const ordered = Object.fromEntries(FRAMED.map((p) => [p.link, record[p.link ?? '']]));
      await writeFile(RECORD_PATH, `${JSON.stringify(ordered, null, 2)}\n`);
    }
  });
});
