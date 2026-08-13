/**
 * Reduce a Chromium-rendered PDF to the bytes that depend only on its content.
 *
 * This is the whole basis of the résumé staleness gate. `npm run resume:check`
 * re-renders `src/app/resume/resume.data.ts` and compares the result against the
 * committed `public/jacob-miller-resume.pdf`; if they differ, the PDF is stale
 * and CI fails. That comparison is only possible because Chromium's PDF output
 * is deterministic — two renders of identical content produce identical bytes,
 * verified across separate browser launches — *except* for two timestamp fields
 * it stamps with the wall clock at render time:
 *
 *     /CreationDate (D:20260813154611+00'00')
 *     /ModDate (D:20260813154611+00'00')
 *
 * Left alone, those two make every render differ from every other render and the
 * gate can never pass. Neutralised, the remaining bytes are a pure function of
 * the content, and a single changed character anywhere in the résumé moves them
 * — confirmed against a one-word edit, a one-character edit, and a removed
 * full stop.
 *
 * ## Two functions, because they are two different problems
 *
 * `neutralizeTimestamps` is the rule: which text is volatile, and what replaces
 * it. It is narrow on purpose in both directions — strip too much and the gate
 * goes blind to real edits, strip too little and it reports a stale PDF on every
 * run until somebody deletes the check.
 *
 * `normalizePdf` is the plumbing around it: getting bytes into text and back
 * without corrupting the ~200KB of compressed font data the document is mostly
 * made of. That is a question about encodings, not about résumés, and keeping it
 * out of the rule leaves the rule readable.
 */

/**
 * Replace the two wall-clock timestamps Chromium stamps into every PDF, so that
 * two renders of identical content produce identical text.
 *
 * The fields appear exactly like this, adjacent, inside the document's info
 * object — a `D:` prefix, 14 digits, then a timezone offset written with
 * apostrophes:
 *
 *     /CreationDate (D:20260813154611+00'00')
 *     /ModDate (D:20260813154611+00'00')
 *
 * Both have to go; neutralising only one leaves the other moving. What they are
 * replaced *with* is your call — any fixed value works, as long as it is the
 * same one every time and carries nothing derived from the clock. Text that is
 * not one of these two fields must come back exactly as it arrived, including
 * the many other parenthesised strings in the file.
 *
 * The result does not need to remain a valid PDF. It is only ever compared
 * against another string, never re-opened, so the replacement is free to be a
 * different length from what it replaces.
 *
 * @param {string} text The PDF's bytes as a latin1 string — one character per
 *   byte, including the binary stream data. Treat it as opaque text.
 * @returns {string} The same text with both timestamps neutralised.
 */
export function neutralizeTimestamps(text) {
  const neutralizationText = 'neutralization applied';
  const regex = /D:\d{14}\+00'00'/g;
  return text.replace(regex, neutralizationText);
}

/**
 * Neutralise the volatile fields of a Chromium PDF.
 *
 * `latin1` is the encoding that makes this safe: it maps each byte to the code
 * point of the same value and back again, so the compressed font and image
 * streams survive the round trip untouched. Decoding as UTF-8 would replace
 * every byte above 0x7F with U+FFFD and quietly corrupt the document.
 *
 * @param {Buffer} pdf Raw bytes as returned by Playwright's `page.pdf()`. Not
 *   mutated — only read.
 * @returns {Buffer} The same document with `/CreationDate` and `/ModDate`
 *   neutralised, so that two renders of identical content compare equal.
 */
export function normalizePdf(pdf) {
  return Buffer.from(neutralizeTimestamps(pdf.toString('latin1')), 'latin1');
}
