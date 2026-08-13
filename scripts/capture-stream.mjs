/**
 * Capture the two things about the dashboard's transport that prose cannot show:
 * the container deployment actually streaming, and the badge that names which
 * transport you are looking at, in both of its live states.
 *
 * The repo's most interesting decision is that one `create_app()` builds a
 * serverless deployment that polls and a container deployment that holds a
 * socket open, and that the page says which one it is instead of hiding the
 * difference. Half of that is not on the live demo and never can be — a Vercel
 * function cannot hold a socket. Until this script existed, the WebSocket was
 * only visible to someone who read `test_websocket.py`.
 *
 * The outputs are committed under `docs/images/` and embedded in the README.
 * They are build *inputs*, like the social card `gen-social-assets.mjs` writes,
 * not something CI regenerates: reproducing them needs a container runtime and a
 * network, which no gate here has.
 *
 * ## Running it
 *
 * Three things have to be up, because the point is that they are real:
 *
 *     cd backend && docker compose up -d    # the live-socket deployment, :8000
 *     npm start                             # ng serve on :4200, wsUrl set
 *     node scripts/capture-stream.mjs
 *
 * The dev server is what supplies the socket URL — `environment.prod.ts` sets
 * `wsUrl: null` on purpose, so a production build would poll and there would be
 * nothing to film. The polling half is read from the deployed demo rather than
 * simulated locally, so both halves of the picture are a real deployment.
 *
 * ## Why the frames take this route
 *
 * Playwright screenshots PNG, and PNG does not animate. Rather than depend on
 * `ffmpeg` or `cwebp` — neither of which is on this box, both of which would
 * make the capture un-runnable for the next person — the PNGs go back into the
 * browser and out through `canvas.toDataURL('image/webp')`, which is a complete
 * WebP encoder that ships with Chromium. `webp-anim.mjs` then muxes the frames
 * into one animated file. Chromium is launched with `--force-color-profile=srgb`
 * so the colour profile it embeds and then has dropped describes the space the
 * frames are already in.
 *
 * Screenshots are taken first and encoded afterwards. Encoding inside the
 * capture loop would stall it by tens of milliseconds a frame and the recording
 * would drift out of step with the 2-second broadcast it is supposed to show.
 *
 * Usage: node scripts/capture-stream.mjs [--stream-url U] [--poll-url U]
 */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { encodeAnimatedWebp, readStillWebp } from './webp-anim.mjs';

const imagesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'images'
);

/** Mirrors src/styles.css :root, like `gen-social-assets.mjs` does. */
const COLOR = {
  bg: '#1a1618',
  border: '#3a3236',
  text: '#e8dfe3',
  textSecondary: '#b8a8ae',
  textMuted: '#9a8a90',
  bloodText: '#d88894',
};

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const STREAM_URL = arg('stream-url', 'http://localhost:4200/dashboard');
const POLL_URL = arg('poll-url', 'https://ethereal-hotel-pink.vercel.app/dashboard');

/**
 * 30 frames half a second apart: fifteen seconds of wall clock, sampled and
 * replayed at the same rate, so the recording runs in real time. The broadcaster
 * ticks every 2s (`BROADCAST_INTERVAL_SECONDS`), which puts about seven updates
 * in the loop — enough that a reader sees it is a cadence and not one lucky
 * repaint. Sampling faster would only spend bytes on the dot's pulse.
 */
const FRAME_COUNT = Number(arg('frames', 30));
const FRAME_INTERVAL_MS = Number(arg('interval', 500));

/**
 * Lossy. The subject is a dark page with large flat areas, which WebP handles
 * well: 30 frames of it land around 0.85MB here, comfortably inside the ceiling
 * below, so there is no reason to trade away legibility on the one number that
 * has to stay readable — the guest count that moves.
 */
const QUALITY = Number(arg('quality', 0.8));

/** The DoD's ceiling. A README that takes 4MB to load is not a good README. */
const MAX_BYTES = 2 * 1024 * 1024;

/** The badge, in the two states that mean the data is real. */
const STREAMING_TEXT = /streaming from the API/;
const POLLING_TEXT = /polled from the API/;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Open a dashboard and wait until its badge settles into the expected state.
 *
 * The wait is on the badge rather than on `load`, because the badge *is* the
 * assertion: if the container is down, or the dev server was built with
 * `wsUrl: null`, the page still renders perfectly well and quietly films the
 * wrong transport.
 */
async function openDashboard(browser, url, expected, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const badge = page.locator('.data-source');
  try {
    await badge.filter({ hasText: expected }).waitFor({ state: 'visible', timeout: 30000 });
  } catch {
    const actual = (await badge.first().textContent().catch(() => null))?.trim();
    throw new Error(
      `${url} never reached the expected badge state.\n` +
        `  expected: ${expected}\n` +
        `  showing:  ${actual ?? '(no badge on the page at all)'}\n` +
        `Is \`docker compose up -d\` running in backend/, and \`npm start\` serving :4200?`
    );
  }

  // The charts mount after their data arrives and reflow the page under the
  // clip box. Settling here keeps every frame the same size.
  await page.waitForTimeout(1500);
  return page;
}

/** The union of two elements' boxes, snapped out to even pixel bounds. */
async function unionBox(page, selectors, pad = 16) {
  const boxes = [];
  for (const selector of selectors) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) {
      throw new Error(`Cannot measure "${selector}" — it is not on the page.`);
    }
    boxes.push(box);
  }

  const left = Math.floor(Math.min(...boxes.map((b) => b.x)) - pad);
  const top = Math.floor(Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.ceil(Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.ceil(Math.max(...boxes.map((b) => b.y + b.height)) + pad);

  // Even dimensions: VP8 subsamples chroma in 2×2 blocks and pads odd edges
  // itself, which shows up as a smeared last row.
  return {
    x: Math.max(0, left),
    y: Math.max(0, top),
    width: (right - left) & ~1,
    height: (bottom - top) & ~1,
  };
}

/**
 * Re-encode a PNG as a still WebP through the browser's own encoder.
 *
 * `page` is a throwaway blank tab; passing it in rather than opening one per
 * frame is the difference between one browser context and thirty.
 */
async function toWebp(page, png, quality) {
  const encoded = await page.evaluate(
    async ({ dataUri, quality }) => {
      const img = new Image();
      img.src = dataUri;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/webp', quality).split(',')[1];
    },
    { dataUri: `data:image/png;base64,${png.toString('base64')}`, quality }
  );
  return Buffer.from(encoded, 'base64');
}

/** Record the streaming dashboard and write the animation. */
async function captureAnimation(browser, encoderPage) {
  const page = await openDashboard(browser, STREAM_URL, STREAMING_TEXT, {
    width: 1280,
    height: 900,
  });
  const clip = await unionBox(page, ['.dashboard-header', '.metrics-region']);

  process.stdout.write(
    `recording ${FRAME_COUNT} frames of ${clip.width}×${clip.height} ` +
      `at ${FRAME_INTERVAL_MS}ms — ${((FRAME_COUNT * FRAME_INTERVAL_MS) / 1000).toFixed(1)}s\n`
  );

  const shots = [];
  const startedAt = Date.now();
  for (let i = 0; i < FRAME_COUNT; i++) {
    shots.push(await page.screenshot({ clip, type: 'png', animations: 'allow' }));
    // Sleep to the next slot rather than for a fixed interval, so the time the
    // screenshot itself took does not accumulate into a drifting cadence.
    const nextAt = startedAt + (i + 1) * FRAME_INTERVAL_MS;
    await wait(Math.max(0, nextAt - Date.now()));
  }
  await page.close();

  const frames = [];
  for (const shot of shots) {
    frames.push(readStillWebp(await toWebp(encoderPage, shot, QUALITY)).bitstream);
  }

  const webp = encodeAnimatedWebp(frames, {
    width: clip.width,
    height: clip.height,
    frameDurationMs: FRAME_INTERVAL_MS,
  });

  if (webp.length > MAX_BYTES) {
    throw new Error(
      `The animation is ${(webp.length / 1024 / 1024).toFixed(2)}MB, over the 2MB ceiling. ` +
        `Re-run with a lower --quality or fewer --frames.`
    );
  }

  const file = path.join(imagesDir, 'websocket-stream.webp');
  await writeFile(file, webp);
  return { file, bytes: webp.length };
}

/**
 * Photograph the badge on both deployments and set the two side by side.
 *
 * Two separate images would let a reader see each state without ever seeing them
 * as a pair, and the pair is the whole point — the difference between them is a
 * designed behaviour, not one of them being broken.
 */
async function captureBadges(browser) {
  const shots = [];
  for (const [url, expected, deployment, detail] of [
    [STREAM_URL, STREAMING_TEXT, 'Container', 'FastAPI in Docker, holding a WebSocket open'],
    [POLL_URL, POLLING_TEXT, 'Serverless', 'Vercel function, no socket to hold'],
  ]) {
    const page = await openDashboard(browser, url, expected, { width: 1280, height: 900 });
    const png = await page.locator('.data-source').filter({ hasText: expected }).screenshot();
    shots.push({ deployment, detail, uri: `data:image/png;base64,${png.toString('base64')}` });
    await page.close();
  }

  // The viewport height is a floor, not the crop: the card is screenshotted by
  // its `body` box below so it ends where the content ends.
  const page = await browser.newPage({ viewport: { width: 980, height: 200 }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 980px;
    background: ${COLOR.bg};
    color: ${COLOR.text};
    font-family: Georgia, 'Times New Roman', serif;
    padding: 34px 40px 38px;
  }
  h1 { font-size: 19px; font-weight: normal; letter-spacing: 0.01em; }
  h1 span { color: ${COLOR.bloodText}; }
  .sub { color: ${COLOR.textMuted}; font-size: 14px; margin-top: 7px; }
  .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 26px; }
  .panel { border: 1px solid ${COLOR.border}; border-radius: 8px; padding: 20px 22px 22px; }
  .deployment { font-size: 12px; letter-spacing: 0.13em; text-transform: uppercase; color: ${COLOR.textMuted}; }
  .badge { margin: 14px 0 13px; }
  .badge img { display: block; height: 30px; width: auto; }
  .detail { color: ${COLOR.textSecondary}; font-size: 14px; line-height: 1.45; }
</style></head>
<body>
  <h1>One <span>create_app()</span>, two transports — and the page says which</h1>
  <p class="sub">The same dashboard, against the two deployments this repo builds.</p>
  <div class="panels">
    ${shots
      .map(
        (s) => `<div class="panel">
      <div class="deployment">${s.deployment}</div>
      <div class="badge"><img src="${s.uri}" alt="" /></div>
      <div class="detail">${s.detail}</div>
    </div>`
      )
      .join('\n    ')}
  </div>
</body></html>`);
  await page.evaluate(() => document.fonts.ready);

  const file = path.join(imagesDir, 'connection-badge-states.png');
  await page.locator('body').screenshot({ path: file });
  await page.close();
  return { file };
}

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
const written = [];

try {
  const encoderPage = await browser.newPage();
  written.push(await captureAnimation(browser, encoderPage));
  await encoderPage.close();
  written.push(await captureBadges(browser));
} finally {
  await browser.close();
}

for (const { file, bytes } of written) {
  const size = bytes === undefined ? '' : ` (${(bytes / 1024).toFixed(0)}kB)`;
  process.stdout.write(`wrote ${path.relative(process.cwd(), file)}${size}\n`);
}
