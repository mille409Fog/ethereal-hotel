/**
 * The writing behind `/writing`: MURMURATION_LOG, a running record of work on
 * MURMURATION, to be turned into a long-form essay later.
 *
 * The log itself is `murmuration-log.txt`, a plain text file, so that adding
 * to it is typing rather than editing a data structure. Its format is the
 * smallest that still gives entries a date and an anchor:
 *
 *   - A blank line separates paragraphs.
 *   - A paragraph that is nothing but a `YYYY-MM-DD` date starts a new entry,
 *     and becomes its heading and its link (`/writing#2026-10-18`).
 *   - Text before the first date is kept, as an entry with no date.
 *
 * Append to the end: oldest first, because the page is read top to bottom as a
 * narrative. `writing.spec.ts` fails on an impossible date or one out of order.
 */
import LOG_TEXT from './murmuration-log.txt';

/** One entry in the log. */
export interface ILogEntry {
  /** `YYYY-MM-DD`, or null for text written before the first date. */
  readonly date: string | null;

  /** The entry itself, one string per paragraph. */
  readonly paragraphs: readonly string[];
}

const DATE_LINE = /^\d{4}-\d{2}-\d{2}$/;

/** Split the log's text into dated entries. Line endings may be CRLF or LF. */
export function parseLog(text: string): ILogEntry[] {
  const entries: Array<{ date: string | null; paragraphs: string[] }> = [];
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  for (const block of blocks) {
    if (DATE_LINE.test(block)) {
      entries.push({ date: block, paragraphs: [] });
    } else if (entries.length === 0) {
      entries.push({ date: null, paragraphs: [block] });
    } else {
      entries[entries.length - 1].paragraphs.push(block);
    }
  }
  return entries;
}

export const MURMURATION_LOG: readonly ILogEntry[] = parseLog(LOG_TEXT);
