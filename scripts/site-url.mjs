/**
 * Find the places a file names this site by anything other than its one address.
 *
 * `src/route-meta.json`'s `siteUrl` is the site's canonical origin, and the
 * build stamps it into every route's canonical link and social card. But the
 * address is also written out by hand in a dozen other places — the README's
 * demo link, the résumé, the OG card's footer, a CORS example, a capture
 * script's default — and nothing tied those to it. Moving off the generated
 * `*.vercel.app` host found thirteen of them across eleven files; a domain move
 * that catches twelve leaves a résumé or a social card pointing at a host that
 * no longer answers, and nothing goes red.
 *
 * `npm run check:docs` runs this over every tracked text file. It lives in its
 * own module, rather than inside `check-docs.mjs`, so `site-url.test.mjs` can
 * judge it without running the whole gate.
 */

/**
 * Every mention in `text` of this site at an address that is not `siteUrl`.
 *
 * `siteUrl` is an origin with no trailing slash, as `route-meta.json` spells it
 * (`https://jacobmiller.dev`). Returns the offending fragments as written, in
 * order of first appearance, each once; `[]` means the text is clean.
 *
 * @param {string} text
 * @param {string} siteUrl
 * @returns {string[]}
 */
export function strayHosts(text, siteUrl) {
  const host = new URL(siteUrl).host.replace(/\./g, '\\.');

  // Each alternative is fenced on both sides so it cannot be the tail of a
  // longer name (`notjacobmiller.dev`) or the head of one (`.devices`), and
  // so prose about the pattern itself (`*.vercel.app`) is not a host.
  const BEFORE = '(?<![\\w.*-])';
  const AFTER = '(?![\\w-])';
  const stray = new RegExp(
    [
      `${BEFORE}[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.vercel\\.app${AFTER}`,
      `${BEFORE}www\\.${host}${AFTER}`,
      `${BEFORE}http://${host}${AFTER}`,
    ].join('|'),
    'gi'
  );

  return [...new Set(Array.from(text.matchAll(stray), ([match]) => match))];
}
