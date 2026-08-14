/**
 * Read the text layer out of a Chromium-rendered PDF.
 *
 * This is what the résumé staleness gate rests on. `npm run resume:check`
 * re-renders `src/app/resume/resume.data.ts` and compares the result against the
 * committed `public/jacob-miller-resume.pdf` — but it compares *what the
 * document says*, not the bytes it says it in, because the bytes are not
 * comparable across machines.
 *
 * ## Why not just diff the bytes
 *
 * That is what this gate used to do, and it could never pass in CI. Chromium's
 * PDF output is deterministic on one machine and structurally different on
 * another. The same résumé, same Playwright, same fonts, rendered on Windows and
 * on the Linux CI image:
 *
 *     Windows   210,034 bytes   364 objects   /Descent 372   /CapHeight 700
 *     Linux      96,727 bytes   163 objects   /Descent -372  /CapHeight -700
 *
 * Neither brand face survives as a real embedded font the way you would hope.
 * Skia cannot embed Crimson Pro at all here and decomposes it into Type3
 * glyph-procedure fonts — eleven of them on Windows, five on Linux, with
 * different bounding boxes. Cinzel does embed as a CIDFontType2 on both, and
 * even its descriptor metrics come out sign-flipped between the two platforms.
 * Embedding the faces (see `scripts/resume-fonts/`) buys a stable *layout* and a
 * gate that needs no network; it does not buy identical bytes, and the old
 * comment in `render-resume.mjs` claiming otherwise was simply wrong.
 *
 * The text layer, though, is identical: 2,095 characters, exact match, verified
 * by rendering the same source in `mcr.microsoft.com/playwright` and on the
 * author's Windows box. So that is what the gate compares.
 *
 * ## The one rule this file obeys
 *
 * **Never read a position.** Glyph advances (`Td`) differ between platforms by
 * fractions of a point, so any logic keyed on coordinates — synthesising spaces
 * from wide kerns, breaking lines on vertical jumps — would reintroduce exactly
 * the platform dependence this exists to remove. Only glyph codes and their
 * `/ToUnicode` mappings are read. Chromium emits real space glyphs, so nothing
 * is lost by it.
 */
import { inflateSync } from 'node:zlib';

/**
 * Split a PDF into its top-level indirect objects, keyed by object number.
 *
 * Chromium writes plain `N 0 obj … endobj` records rather than the compressed
 * object streams a PDF 1.5 producer would, which is what makes a scan like this
 * sufficient. The body is matched lazily, so a stream whose compressed bytes
 * happened to spell `endobj` would truncate the object — at ~210KB of Flate
 * output the expected number of such collisions is around 10^-9, and the gate
 * fails loudly rather than silently if one ever lands.
 */
function indirectObjects(text) {
  const objects = new Map();
  const pattern = /(\d+) 0 obj\r?\n?([\s\S]*?)\r?\n?endobj/g;

  for (const [, id, body] of text.matchAll(pattern)) {
    objects.set(Number(id), body);
  }
  return objects;
}

/**
 * The payload of an object's stream, inflated if it is Flate-compressed.
 *
 * Returns null for objects that carry no stream. The retry on a one-byte-shorter
 * buffer covers the trailing EOL some writers put between the stream data and
 * `endstream` and do not count in `/Length`.
 */
function streamOf(body) {
  const at = body.indexOf('stream');
  if (at === -1) {
    return null;
  }

  const start = body.indexOf('\n', at) + 1;
  const end = body.lastIndexOf('endstream');
  if (end <= start) {
    return null;
  }

  const raw = Buffer.from(body.slice(start, end), 'latin1');
  if (!/FlateDecode/.test(body.slice(0, at))) {
    return raw.toString('latin1');
  }

  for (const candidate of [raw, raw.subarray(0, raw.length - 1)]) {
    try {
      return inflateSync(candidate).toString('latin1');
    } catch {
      // Fall through to the shorter buffer, then give up.
    }
  }
  return null;
}

/** Decode a UTF-16BE hex run to a string, dropping the padding nulls Skia emits. */
function fromUtf16BeHex(hex) {
  const units = (hex.match(/.{4}/g) ?? []).map((unit) => parseInt(unit, 16));
  return String.fromCharCode(...units.filter((unit) => unit !== 0));
}

/**
 * Parse a `/ToUnicode` CMap into the map from character code to the text it
 * stands for.
 *
 * Both forms a CMap can use are handled, because Skia emits both:
 *
 *     3 beginbfchar  <0003> <0020>  endbfchar          one code at a time
 *     2 beginbfrange <0010> <0012> <0041> endbfrange   a contiguous run
 *
 * A bfchar value may be several UTF-16 units long — that is how a ligature glyph
 * says it means "fi" — so values are decoded as runs rather than single
 * characters. Ranges are expanded eagerly; the largest here is a couple of
 * hundred codes, so the map stays small and lookup stays a hash hit.
 */
export function parseToUnicode(cmap) {
  const map = new Map();

  for (const [, block] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, value] of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(code, 16), fromUtf16BeHex(value));
    }
  }

  const rangePattern = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
  for (const [, block] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, from, to, start] of block.matchAll(rangePattern)) {
      const first = parseInt(from, 16);
      const last = parseInt(to, 16);
      const base = parseInt(start, 16);

      for (let code = first; code <= last; code++) {
        map.set(code, String.fromCharCode(base + (code - first)));
      }
    }
  }

  return map;
}

/**
 * The fonts a page can select, keyed by the resource name the content stream
 * uses (`/F4`, `/F5`, …).
 *
 * `codeBytes` is the width of one character code in the show-text operands, and
 * it is not cosmetic: composite fonts (`/Type0`, `Identity-H`) address glyphs
 * with two bytes and simple ones — including the `/Type3` fonts Crimson Pro
 * becomes — with one. Reading a Type3 string two bytes at a time yields
 * plausible-looking garbage rather than an error.
 */
function fontsOf(page, objects) {
  const fonts = new Map();
  const resources = page.match(/\/Font\s*<<([\s\S]*?)>>/);
  if (!resources) {
    return fonts;
  }

  for (const [, name, ref] of resources[1].matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
    const body = objects.get(Number(ref)) ?? '';
    const toUnicodeRef = body.match(/\/ToUnicode\s+(\d+) 0 R/);
    const cmap = toUnicodeRef ? streamOf(objects.get(Number(toUnicodeRef[1])) ?? '') : null;

    fonts.set(name, {
      codeBytes: /\/Subtype\s*\/Type0/.test(body) ? 2 : 1,
      toUnicode: cmap ? parseToUnicode(cmap) : new Map(),
    });
  }

  return fonts;
}

/** Every `/Type /Page` object, in the order Chromium wrote them. */
function pagesOf(objects) {
  return [...objects.entries()]
    .filter(([, body]) => /\/Type\s*\/Page(?![sA-Za-z])/.test(body))
    .sort(([a], [b]) => a - b)
    .map(([, body]) => body);
}

/** A page's content stream, joining the parts when `/Contents` is an array. */
function contentOf(page, objects) {
  const refs = [...(page.match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)?.[1] ?? '').matchAll(/(\d+) 0 R/g)];

  return refs
    .map(([, ref]) => streamOf(objects.get(Number(ref)) ?? '') ?? '')
    .join('\n');
}

/** Decode one show-text operand — `<hex>` or a `(literal)` string — to text. */
function decodeOperand(operand, font) {
  if (operand.startsWith('<')) {
    const hex = operand.slice(1, -1).replace(/\s+/g, '');
    const width = font.codeBytes * 2;
    const codes = hex.match(new RegExp(`.{1,${width}}`, 'g')) ?? [];

    return codes.map((code) => font.toUnicode.get(parseInt(code, 16)) ?? '').join('');
  }

  // Literal strings are single-byte codes. Chromium does not currently emit
  // them for subset fonts, but the operator is legal and cheap to support.
  const body = operand.slice(1, -1).replace(/\\([nrtbf()\\])/g, '$1');
  return [...body].map((char) => font.toUnicode.get(char.charCodeAt(0)) ?? char).join('');
}

/**
 * The text shown by one content stream.
 *
 * Only `BT … ET` blocks are read. Everything outside them is drawing — fills,
 * clips, the rules under the section headings — and skipping it means the
 * tokeniser never meets a `<…>` that is a graphics operand rather than a string.
 */
function textOf(content, fonts) {
  const operators = /\/(\w+)\s+[\d.-]+\s+Tf|(<[0-9a-fA-F\s]*>|\((?:[^()\\]|\\.)*\))\s*(?:Tj|'|")|\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
  let shown = '';

  for (const [, block] of content.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
    let font = null;

    for (const [, selected, operand, array] of block.matchAll(operators)) {
      if (selected !== undefined) {
        font = fonts.get(selected) ?? null;
      } else if (font === null) {
        continue;
      } else if (operand !== undefined) {
        shown += decodeOperand(operand, font);
      } else if (array !== undefined) {
        // The numbers interleaved in a TJ array are kerns, and kerns are
        // positions. Deliberately ignored — see the header.
        for (const [piece] of array.matchAll(/<[0-9a-fA-F\s]*>|\((?:[^()\\]|\\.)*\)/g)) {
          shown += decodeOperand(piece, font);
        }
      }
    }
  }

  return shown;
}

/**
 * The text of a Chromium-rendered PDF, as one whitespace-normalised string.
 *
 * Line and word breaks are not reconstructed — they live in the positions this
 * refuses to read — so the result runs headings into the text beneath them. That
 * is fine for what it is for: two of these compare equal exactly when the two
 * documents say the same thing.
 *
 * @param {Buffer} pdf Raw bytes, as `page.pdf()` returns them or as the
 *   committed file holds them. Not mutated.
 * @returns {string} Every character the document shows, in content order.
 * @throws {Error} If the document yields no text at all. Two empty strings
 *   compare equal, so a parser that quietly failed would turn this gate green
 *   forever; better to be loud about not understanding the file.
 */
export function extractText(pdf) {
  const objects = indirectObjects(pdf.toString('latin1'));
  const pages = pagesOf(objects);

  const text = pages
    .map((page) => textOf(contentOf(page, objects), fontsOf(page, objects)))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');

  if (text === '') {
    throw new Error(
      `Found no text in a ${pdf.length}-byte PDF (${objects.size} objects, ${pages.length} ` +
        `pages).\nThe document is either empty or in a shape scripts/pdf-text.mjs does not ` +
        `understand.\nDo not treat this as the résumé being up to date.`
    );
  }

  return text;
}

/**
 * Each page's `/MediaBox` size, rounded to hundredths of a point.
 *
 * The companion to the text: it is what notices the page size or the page
 * *count* changing, neither of which alters a single character. Rounded because
 * the exact value carries Chromium's millimetre conversion (`595.91998`), and
 * the last digit of that is not worth failing a build over.
 *
 * @param {Buffer} pdf Raw bytes. Not mutated.
 * @returns {string[]} One `"WIDTHxHEIGHT"` per page, in document order.
 */
export function pageSizes(pdf) {
  const objects = indirectObjects(pdf.toString('latin1'));

  return pagesOf(objects).map((page) => {
    const box = page.match(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/);
    if (!box) {
      return 'unknown';
    }

    const round = (value) => Math.round(Number(value) * 100) / 100;
    return `${round(box[3]) - round(box[1])}x${round(box[4]) - round(box[2])}`;
  });
}
