/**
 * The tests that judge `neutralizeTimestamps` and the plumbing around it.
 *
 *     npm run test:scripts
 *
 * The first block is the one to work against: plain strings in, plain strings
 * out, no Buffers and no browser. The second block checks that the same rule
 * survives being applied to real bytes.
 *
 * Note what is *not* asserted anywhere below: the literal text the timestamps
 * are replaced with. Any fixed value works, so pinning one here would be testing
 * an implementation rather than the property. What has to hold is that two
 * renders differing only in their timestamps come out equal, that a render
 * differing in its content does not, and that nothing else is touched.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { neutralizeTimestamps, normalizePdf } from './pdf-normalize.mjs';

/**
 * The fragment of a real PDF that matters here: the info object, with both
 * timestamps, surrounded by the sort of text that must survive untouched.
 */
function infoObject({ created, modified = created, name = 'Jacob Miller' }) {
  return (
    `%PDF-1.7\n` +
    `1 0 obj\n` +
    `<</Producer (Skia/PDF m151)\n` +
    `/CreationDate (D:${created}+00'00')\n` +
    `/ModDate (D:${modified}+00'00')>>\n` +
    `endobj\n` +
    `2 0 obj\n<</Length 40>>\nstream\n(${name}) Tj\nendstream\nendobj\n` +
    `trailer\n<</Root 1 0 R>>\n%%EOF\n`
  );
}

const MORNING = '20260813154611';
const EVENING = '20261225090000';

describe('neutralizeTimestamps', () => {
  test('returns a string', () => {
    assert.equal(typeof neutralizeTimestamps(infoObject({ created: MORNING })), 'string');
  });

  test('makes two renders stamped at different times compare equal', () => {
    const morning = infoObject({ created: MORNING });
    const evening = infoObject({ created: EVENING });

    assert.notEqual(morning, evening, 'fixture is wrong: these should start out different');
    assert.equal(neutralizeTimestamps(morning), neutralizeTimestamps(evening));
  });

  test('handles /CreationDate even when /ModDate is unchanged', () => {
    // Catches a rule that only ever looked at /ModDate.
    const a = infoObject({ created: MORNING, modified: MORNING });
    const b = infoObject({ created: EVENING, modified: MORNING });

    assert.equal(neutralizeTimestamps(a), neutralizeTimestamps(b));
  });

  test('handles /ModDate even when /CreationDate is unchanged', () => {
    // …and the mirror image, for a rule that only ever looked at /CreationDate.
    const a = infoObject({ created: MORNING, modified: MORNING });
    const b = infoObject({ created: MORNING, modified: EVENING });

    assert.equal(neutralizeTimestamps(a), neutralizeTimestamps(b));
  });

  test('leaves no trace of the original timestamp', () => {
    const out = neutralizeTimestamps(infoObject({ created: MORNING }));

    assert.ok(!out.includes(MORNING), `the original timestamp is still in the output:\n${out}`);
  });

  test('still reports a difference when the content changes', () => {
    const before = neutralizeTimestamps(infoObject({ created: MORNING, name: 'Jacob Miller' }));
    const after = neutralizeTimestamps(infoObject({ created: MORNING, name: 'Jacob Millar' }));

    assert.notEqual(before, after, 'a real edit must survive normalisation');
  });

  test('catches a content change even when the timestamps also differ', () => {
    // The realistic case: the résumé was edited and re-rendered an hour later.
    const before = neutralizeTimestamps(infoObject({ created: MORNING, name: 'Senior Engineer' }));
    const after = neutralizeTimestamps(infoObject({ created: EVENING, name: 'Staff Engineer' }));

    assert.notEqual(before, after);
  });

  test('touches nothing except the two timestamps', () => {
    const out = neutralizeTimestamps(infoObject({ created: MORNING }));

    // Other parenthesised strings look similar and must be left alone.
    assert.ok(out.includes('(Skia/PDF m151)'), 'the Producer string was altered');
    assert.ok(out.includes('(Jacob Miller) Tj'), 'the page content was altered');
    assert.ok(out.startsWith('%PDF-1.7'), 'the header was altered');
    assert.ok(out.endsWith('%%EOF\n'), 'the trailer was altered');
  });

  test('leaves a document without timestamps alone', () => {
    const plain = '%PDF-1.7\n1 0 obj\n<</Root 1 0 R>>\n%%EOF\n';

    assert.equal(neutralizeTimestamps(plain), plain);
  });

  test('is idempotent', () => {
    const once = neutralizeTimestamps(infoObject({ created: MORNING }));

    assert.equal(neutralizeTimestamps(once), once, 'normalising twice must change nothing');
  });
});

describe('normalizePdf', () => {
  /** Every byte value, so an encoding that cannot round-trip corrupts
   *  something detectable rather than getting away with it. */
  const BLOB = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

  /**
   * The same document as a Buffer, with `BLOB` spliced into its content stream.
   *
   * Spliced at a located offset rather than by `split('stream\n')`: that
   * separator also occurs inside `endstream`, so the split yields three parts
   * and destructuring two of them silently drops the trailer — which is exactly
   * the bug this fixture shipped with, and it made the assertion below fail
   * against a correct implementation.
   */
  function fakePdf(stamp, name = 'Jacob Miller') {
    const text = infoObject({ created: stamp, name });
    const marker = `(${name}) Tj`;
    const at = text.indexOf(marker) + marker.length;

    return Buffer.concat([
      Buffer.from(text.slice(0, at), 'latin1'),
      BLOB,
      Buffer.from(text.slice(at), 'latin1'),
    ]);
  }

  test('returns a Buffer', () => {
    assert.ok(Buffer.isBuffer(normalizePdf(fakePdf(MORNING))));
  });

  test('makes two renders stamped at different times compare equal', () => {
    assert.deepEqual(normalizePdf(fakePdf(MORNING)), normalizePdf(fakePdf(EVENING)));
  });

  test('still reports a difference when the content changes', () => {
    assert.notDeepEqual(
      normalizePdf(fakePdf(MORNING, 'Jacob Miller')),
      normalizePdf(fakePdf(MORNING, 'Jacob Millar'))
    );
  });

  test('preserves every other byte, including binary stream data', () => {
    const normalized = normalizePdf(fakePdf(MORNING));

    assert.ok(normalized.includes(BLOB), 'binary payload was corrupted');
    assert.ok(normalized.includes(Buffer.from('Skia/PDF m151', 'latin1')));
    assert.ok(normalized.includes(Buffer.from('%%EOF', 'latin1')));
  });

  test('does not mutate its argument', () => {
    const pdf = fakePdf(MORNING);
    const copy = Buffer.from(pdf);

    normalizePdf(pdf);
    assert.deepEqual(pdf, copy, 'the input buffer must be left as it was');
  });
});
