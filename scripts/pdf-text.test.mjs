/**
 * The tests that judge the résumé staleness gate's new basis.
 *
 *     npm run test:scripts
 *
 * The gate this replaced compared PDF bytes, and it could never pass in CI:
 * Chromium renders the same source to 210KB in 364 objects on Windows and 97KB
 * in 163 objects on Linux. So the property under test here is not "these bytes
 * are stable" — they are not, and nothing can make them so — but the narrower
 * one that is actually true: **two documents that say the same thing extract to
 * the same text, whatever the renderer did with the glyphs.**
 *
 * That property has a mirror that matters just as much, and both are asserted
 * below: a document that says something *different* must not extract to the same
 * text. A gate that passes everything and a gate that fails everything look
 * identical from the outside, and the first one is worse because it looks green.
 *
 * The fixtures are hand-built PDFs rather than rendered ones, so the tests need
 * no browser and can say precisely which construct they are about. The last
 * block runs the real committed résumé through it, so the synthetic fixtures
 * cannot drift into describing a file format nothing writes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { extractText, pageSizes, parseToUnicode } from './pdf-text.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------- */

/** One indirect object. */
function object(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

/** An object carrying a stream, optionally Flate-compressed as Chromium's are. */
function streamObject(id, dict, payload, { compress = false } = {}) {
  const data = compress ? deflateSync(Buffer.from(payload, 'latin1')).toString('latin1') : payload;
  const filter = compress ? '/Filter /FlateDecode\n' : '';

  return object(id, `<<${filter}/Length ${data.length}>>\nstream\n${data}\nendstream`);
}

/** A ToUnicode CMap mapping single codes, in the `beginbfchar` form. */
function bfchar(pairs) {
  const body = pairs
    .map(([code, text]) => {
      const value = [...text].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
      return `<${code.toString(16).padStart(4, '0')}> <${value}>`;
    })
    .join('\n');

  return `/CIDInit /ProcSet findresource begin\n${pairs.length} beginbfchar\n${body}\nendbfchar\nend`;
}

/**
 * A one-page PDF showing `content`, with one font.
 *
 * `twoByte` picks whether the font is composite (`/Type0`, two-byte codes, what
 * Cinzel becomes) or simple (one-byte codes, what Crimson Pro becomes once Skia
 * gives up on embedding it).
 */
function onePage({ content, cmap, twoByte = true, mediaBox = '0 0 595.92 792.96', compress = false }) {
  return Buffer.from(
    `%PDF-1.7\n` +
      object(
        1,
        `<</Type /Page\n/MediaBox [${mediaBox}]\n` +
          `/Resources <</Font <</F4 4 0 R>>>>\n/Contents 2 0 R>>`
      ) +
      streamObject(2, null, content, { compress }) +
      object(
        4,
        `<</Type /Font\n/Subtype /${twoByte ? 'Type0' : 'Type3'}\n/ToUnicode 5 0 R>>`
      ) +
      streamObject(5, null, cmap) +
      `trailer\n<</Root 1 0 R>>\n%%EOF\n`,
    'latin1'
  );
}

/** The glyph codes for "Hi", and a CMap that says so. */
const HI = bfchar([
  [1, 'H'],
  [2, 'i'],
]);

/* ---------------------------------------------------------------------------
 * parseToUnicode
 * ------------------------------------------------------------------------- */

describe('parseToUnicode', () => {
  test('reads the beginbfchar form', () => {
    const map = parseToUnicode(bfchar([[1, 'H']]));

    assert.equal(map.get(1), 'H');
  });

  test('reads the beginbfrange form, expanding the run', () => {
    const map = parseToUnicode('2 beginbfrange\n<0010> <0012> <0041>\nendbfrange');

    assert.equal(map.get(0x10), 'A');
    assert.equal(map.get(0x11), 'B');
    assert.equal(map.get(0x12), 'C');
    assert.equal(map.get(0x13), undefined, 'the range must stop where it says it does');
  });

  test('reads both forms out of one CMap', () => {
    const map = parseToUnicode(
      `1 beginbfchar\n<0001> <004A>\nendbfchar\n1 beginbfrange\n<0010> <0011> <0061>\nendbfrange`
    );

    assert.equal(map.get(1), 'J');
    assert.equal(map.get(0x10), 'a');
    assert.equal(map.get(0x11), 'b');
  });

  test('keeps a multi-character value, as a ligature glyph needs', () => {
    // One glyph, two characters: this is how a PDF says a glyph means "fi".
    const map = parseToUnicode('1 beginbfchar\n<0005> <00660069>\nendbfchar');

    assert.equal(map.get(5), 'fi');
  });

  test('drops the padding nulls Skia writes into short values', () => {
    const map = parseToUnicode('1 beginbfchar\n<0003> <00200000>\nendbfchar');

    assert.equal(map.get(3), ' ');
  });

  test('returns an empty map for a CMap with no mappings', () => {
    assert.equal(parseToUnicode('/CIDInit /ProcSet findresource begin\nend').size, 0);
  });
});

/* ---------------------------------------------------------------------------
 * extractText
 * ------------------------------------------------------------------------- */

describe('extractText', () => {
  test('decodes two-byte codes for a composite font', () => {
    const pdf = onePage({ content: 'BT\n/F4 10 Tf\n<0001> Tj\n<0002> Tj\nET', cmap: HI });

    assert.equal(extractText(pdf), 'Hi');
  });

  test('decodes one-byte codes for a simple font', () => {
    // The Type3 case. Reading this two bytes at a time yields plausible-looking
    // garbage rather than an error, so it is worth its own test.
    const pdf = onePage({
      content: 'BT\n/F4 10 Tf\n<01> Tj\n<02> Tj\nET',
      cmap: HI,
      twoByte: false,
    });

    assert.equal(extractText(pdf), 'Hi');
  });

  test('reads a whole string in one operand', () => {
    const pdf = onePage({ content: 'BT\n/F4 10 Tf\n<00010002> Tj\nET', cmap: HI });

    assert.equal(extractText(pdf), 'Hi');
  });

  test('reads the glyphs out of a TJ array', () => {
    const pdf = onePage({ content: 'BT\n/F4 10 Tf\n[<0001> -250 <0002>] TJ\nET', cmap: HI });

    assert.equal(extractText(pdf), 'Hi');
  });

  test('inflates a compressed content stream', () => {
    const pdf = onePage({ content: 'BT\n/F4 10 Tf\n<00010002> Tj\nET', cmap: HI, compress: true });

    assert.equal(extractText(pdf), 'Hi');
  });

  /**
   * The load-bearing one. Glyph advances differ between platforms by fractions
   * of a point — that is the entire reason the byte comparison this replaced
   * could never pass — so anything the extractor reads from a coordinate would
   * put the platform dependence straight back.
   */
  test('ignores positions entirely', () => {
    const windows = onePage({
      content: 'BT\n/F4 10 Tf\n1 0 0 -1 0 28 Tm\n<0001> Tj\n12.5321198 0 Td <0002> Tj\nET',
      cmap: HI,
    });
    const linux = onePage({
      content: 'BT\n/F4 10 Tf\n1 0 0 -1 0 28 Tm\n<0001> Tj\n12.4998871 0 Td <0002> Tj\nET',
      cmap: HI,
    });

    assert.notEqual(windows.toString('latin1'), linux.toString('latin1'), 'fixture is wrong');
    assert.equal(extractText(windows), extractText(linux));
  });

  test('ignores the kerns in a TJ array', () => {
    const wide = onePage({ content: 'BT\n/F4 10 Tf\n[<0001> -900 <0002>] TJ\nET', cmap: HI });
    const tight = onePage({ content: 'BT\n/F4 10 Tf\n[<0001> -10 <0002>] TJ\nET', cmap: HI });

    assert.equal(extractText(wide), extractText(tight), 'a kern is a position, not a space');
  });

  test('still reports a difference when the text changes', () => {
    const before = onePage({ content: 'BT\n/F4 10 Tf\n<00010002> Tj\nET', cmap: HI });
    const after = onePage({ content: 'BT\n/F4 10 Tf\n<00020001> Tj\nET', cmap: HI });

    assert.notEqual(extractText(before), extractText(after), 'a real edit must survive');
  });

  test('ignores drawing outside a text block', () => {
    // The rules under the section headings are `re f` fills. A tokeniser that
    // scanned the whole stream could meet one of their operands as a string.
    const pdf = onePage({
      content: '0 78 683 1 re\nf\nBT\n/F4 10 Tf\n<00010002> Tj\nET\n0 243 683 1 re\nf',
      cmap: HI,
    });

    assert.equal(extractText(pdf), 'Hi');
  });

  test('collapses whitespace so line breaks cannot matter', () => {
    const pdf = onePage({
      content: 'BT\n/F4 10 Tf\n<0001> Tj\nET\nBT\n/F4 10 Tf\n<0002> Tj\nET',
      cmap: HI,
    });

    assert.equal(extractText(pdf), 'Hi', 'the join between text blocks must normalise away');
  });

  /**
   * A parser that quietly returned '' would compare equal against another ''
   * and turn this gate green forever — the failure mode that is worse than
   * failing, because it looks like success.
   */
  test('throws rather than returning nothing it could not parse', () => {
    const empty = Buffer.from('%PDF-1.7\n1 0 obj\n<</Type /Page>>\nendobj\n%%EOF\n', 'latin1');

    assert.throws(() => extractText(empty), /no text/i);
  });

  test('does not mutate its argument', () => {
    const pdf = onePage({ content: 'BT\n/F4 10 Tf\n<00010002> Tj\nET', cmap: HI });
    const copy = Buffer.from(pdf);

    extractText(pdf);
    assert.deepEqual(pdf, copy);
  });
});

/* ---------------------------------------------------------------------------
 * pageSizes
 * ------------------------------------------------------------------------- */

describe('pageSizes', () => {
  test('reports width x height per page', () => {
    const pdf = onePage({ content: 'BT\n/F4 10 Tf\n<0001> Tj\nET', cmap: HI });

    assert.deepEqual(pageSizes(pdf), ['595.92x792.96']);
  });

  test('rounds away the last digit of Chromium’s millimetre conversion', () => {
    const pdf = onePage({
      content: 'BT\n/F4 10 Tf\n<0001> Tj\nET',
      cmap: HI,
      mediaBox: '0 0 595.91998 792.95996',
    });

    assert.deepEqual(pageSizes(pdf), ['595.92x792.96']);
  });

  test('notices a page that changed size', () => {
    const letter = onePage({ content: 'BT\n/F4 10 Tf\n<0001> Tj\nET', cmap: HI });
    const a4 = onePage({
      content: 'BT\n/F4 10 Tf\n<0001> Tj\nET',
      cmap: HI,
      mediaBox: '0 0 595.92 841.89',
    });

    assert.notDeepEqual(pageSizes(letter), pageSizes(a4));
  });
});

/* ---------------------------------------------------------------------------
 * The real thing
 * ------------------------------------------------------------------------- */

describe('the committed résumé', () => {
  const pdf = readFileSync(path.join(repoRoot, 'public', 'jacob-miller-resume.pdf'));

  test('is one page at the A4-and-Letter intersection', () => {
    // 210 x 279.4mm in points, which is what render-resume.mjs asks for.
    assert.deepEqual(pageSizes(pdf), ['595.92x792.96']);
  });

  test('extracts as the résumé rather than as mojibake', () => {
    const text = extractText(pdf);

    for (const expected of [
      'Jacob Miller',
      'Charter Communications',
      'June 2023 – Present',
      'B.S. Mathematics',
      'millerjacob67@gmail.com',
    ]) {
      assert.ok(text.includes(expected), `the extracted text is missing ${JSON.stringify(expected)}`);
    }
  });

  test('extracts no replacement characters', () => {
    // A code the CMap did not cover would come back as '', silently shortening
    // the text; a mis-widthed read comes back as noise. Both show up as the
    // extracted length collapsing, so assert it is in the right ballpark.
    const text = extractText(pdf);

    assert.ok(text.length > 1500, `only ${text.length} characters came out; the parse is wrong`);
    assert.ok(!text.includes('�'));
  });
});
