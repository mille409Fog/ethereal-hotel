/**
 * The tests that judge the one-address rule.
 *
 *     npm run test:scripts
 *
 * Two failure modes look the same from outside and both are asserted below: a
 * check that misses a stray host lets a domain move half-land, and a check that
 * fires on an email address or a `vercel.json` gets deleted by the first person
 * it annoys. The last block runs the real `siteUrl` through it, so the fixtures
 * cannot drift into describing a domain the site does not use.
 *
 * This file is the one tracked file allowed to name the old host — the fixtures
 * have to — and `check-docs.mjs` skips it for that reason.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { strayHosts } from './site-url.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://jacobmiller.dev';

describe('strayHosts', () => {
  describe('passes the canonical address', () => {
    test('as an origin, with or without a path', () => {
      assert.deepEqual(strayHosts(`See ${SITE}/ and ${SITE}/dashboard.`, SITE), []);
    });

    test('bare, as the résumé and the social card print it', () => {
      assert.deepEqual(strayHosts("site: 'jacobmiller.dev',", SITE), []);
    });

    test('in any case, because hostnames have none', () => {
      assert.deepEqual(strayHosts('Visit JacobMiller.dev', SITE), []);
    });

    test('in an HTML attribute', () => {
      assert.deepEqual(strayHosts(`<link rel="canonical" href="${SITE}/" />`, SITE), []);
    });
  });

  describe('flags a generated Vercel host', () => {
    test('as a URL', () => {
      assert.deepEqual(
        strayHosts('**Live demo: https://ethereal-hotel-pink.vercel.app/**', SITE),
        ['ethereal-hotel-pink.vercel.app']
      );
    });

    test('bare', () => {
      assert.deepEqual(strayHosts("site: 'ethereal-hotel-pink.vercel.app',", SITE), [
        'ethereal-hotel-pink.vercel.app',
      ]);
    });

    test('of any name, not only the one this site used to have', () => {
      // A preview deploy's URL pasted into a doc is the same mistake.
      assert.deepEqual(strayHosts('https://ethereal-hotel-git-main-mille409.vercel.app', SITE), [
        'ethereal-hotel-git-main-mille409.vercel.app',
      ]);
    });
  });

  describe('flags the right domain at the wrong address', () => {
    test('on www, which redirects rather than serves', () => {
      assert.deepEqual(strayHosts('https://www.jacobmiller.dev/booking', SITE), [
        'www.jacobmiller.dev',
      ]);
    });

    test('over plain http', () => {
      assert.deepEqual(strayHosts('og:url = http://jacobmiller.dev/', SITE), [
        'http://jacobmiller.dev',
      ]);
    });
  });

  describe('ignores what only looks like this site', () => {
    test('a longer domain that ends in the same letters', () => {
      assert.deepEqual(strayHosts('https://notjacobmiller.dev', SITE), []);
    });

    test('a longer domain that starts with the same letters', () => {
      assert.deepEqual(strayHosts('http://www.jacobmiller.devices.example', SITE), []);
    });

    test('the email address, the GitHub profile and localhost', () => {
      const text =
        "email: 'millerjacob67@gmail.com', github: 'github.com/mille409Fog', " +
        'http://localhost:4200/dashboard';

      assert.deepEqual(strayHosts(text, SITE), []);
    });

    test('Vercel the platform, as opposed to a host on it', () => {
      const text =
        'vercel.json rewrites /api/*; analytics load from /_vercel/insights; ' +
        'a generated *.vercel.app subdomain reads as a scratch deploy.';

      assert.deepEqual(strayHosts(text, SITE), []);
    });
  });

  test('reports each stray once, in the order it first appears', () => {
    const text =
      'https://www.jacobmiller.dev/ then https://ethereal-hotel-pink.vercel.app/ ' +
      'then https://www.jacobmiller.dev/dashboard';

    assert.deepEqual(strayHosts(text, SITE), [
      'www.jacobmiller.dev',
      'ethereal-hotel-pink.vercel.app',
    ]);
  });

  test('reports several strays on one line', () => {
    assert.equal(
      strayHosts('a.vercel.app b.vercel.app http://jacobmiller.dev', SITE).length,
      3
    );
  });

  test('returns nothing for text that mentions no site at all', () => {
    assert.deepEqual(strayHosts('', SITE), []);
  });
});

describe('the committed siteUrl', () => {
  const { siteUrl } = JSON.parse(
    readFileSync(path.join(repoRoot, 'src', 'route-meta.json'), 'utf8')
  );

  test('passes itself', () => {
    assert.deepEqual(strayHosts(`${siteUrl}/`, siteUrl), []);
  });

  test('still catches the host it replaced', () => {
    assert.deepEqual(strayHosts('https://ethereal-hotel-pink.vercel.app/', siteUrl), [
      'ethereal-hotel-pink.vercel.app',
    ]);
  });
});
