import { AUBADE_STATES } from '../solar/state';
import {
  EDITION,
  EDITION_RETURN,
  EDITION_STANDFIRST,
  EDITION_TITLE,
  STANDING_HEADING,
} from './edition';

/**
 * The Reader’s Edition, as a piece of writing.
 *
 * Most of what makes prose good is not testable and none of it is tested here.
 * What is testable is the set of properties AUBADE states as requirements — the
 * length, the absence of clock times, six floors rather than five — plus the
 * structural ones a template would otherwise discover in production, like a
 * duplicate anchor id or an empty section.
 *
 * The word count is the one that matters most, and it is a range rather than a
 * number. AUBADE asks for about twelve hundred words and the failure mode it is
 * guarding against is not a paragraph either way: it is the piece quietly
 * eroding into a caption, one tidy-up at a time, until the "text version" is an
 * alt attribute with headings. A floor of a thousand words catches that. A
 * ceiling catches the opposite drift, which is likelier here than anywhere else
 * in the repository.
 */

/** Every word the page prints from this file, including the headings. */
const words = (): string[] => {
  const parts = [
    EDITION_TITLE,
    EDITION_STANDFIRST,
    STANDING_HEADING,
    ...EDITION.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...section.floors.flatMap((floor) => [floor.floor, floor.name, floor.body]),
      ...section.coda,
    ]),
  ];
  return parts.join(' ').trim().split(/\s+/);
};

/** Every sentence of prose, without the headings and the floor labels. */
const prose = (): string[] =>
  EDITION.flatMap((section) => [
    ...section.paragraphs,
    ...section.floors.map((floor) => floor.body),
    ...section.coda,
  ]);

describe('the Reader’s Edition', () => {
  describe('as a piece of writing', () => {
    it('is about twelve hundred words, which is the requirement', () => {
      const count = words().length;

      expect(count).toBeGreaterThan(1000);
      expect(count).toBeLessThan(1600);
    });

    it('states no wall-clock time and names no month', () => {
      // The rule `desk.ts` keeps: "three in the morning" is a lie to a visitor
      // in a Norwegian summer, and "in December" is a lie to half the planet.
      // Everything that depends on when and where the reader is lives in
      // `standing.ts`, which is computed rather than written.
      const everything = [EDITION_STANDFIRST, ...prose()].join(' ');

      expect(everything).not.toMatch(/\d{1,2}:\d{2}/);
      expect(everything).not.toMatch(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/
      );
    });

    it('does not describe itself as a fallback', () => {
      // AUBADE is explicit that this is not a `<noscript>` tag and not an ARIA
      // description. A work that apologises for existing has conceded the
      // argument in its first paragraph.
      const everything = [EDITION_STANDFIRST, ...prose()].join(' ').toLowerCase();

      for (const hedge of ['fallback', 'instead of', 'if you cannot', 'unfortunately']) {
        expect(everything).not.toContain(hedge);
      }
    });

    it('writes in whole paragraphs rather than fragments', () => {
      // The floor is low deliberately. A short closing line is good writing and
      // this is not a word-count-per-paragraph rule; what it catches is a
      // paragraph that has been reduced to a label.
      for (const paragraph of prose()) {
        expect(paragraph.trim()).toMatch(/[.?!]$/);
        expect(paragraph.split(/\s+/).length).toBeGreaterThan(8);
      }
    });
  });

  describe('as a hotel', () => {
    it('has six floors, descending', () => {
      const floors = EDITION.flatMap((section) => section.floors);

      expect(floors).toHaveLength(6);
      expect(floors.map((floor) => floor.floor)).toEqual([
        'Floor 0',
        'Floor −1',
        'Floor −2',
        'Floor −3',
        'Floor −4',
        'Floor −5',
      ]);
    });

    it('numbers the basement with a minus sign rather than a hyphen', () => {
      // U+2212. A hyphen in "Floor -3" is a typographic tell, and a screen
      // reader reads it as a dash rather than as minus.
      for (const floor of EDITION.flatMap((section) => section.floors).slice(1)) {
        expect(floor.floor).toContain('−');
        expect(floor.floor).not.toContain('-');
      }
    });

    it('says which floors are built and which are only written', () => {
      // The one place the fiction and the truth land on the same sentence.
      // Everything on this page is present tense; four of the six floors do not
      // exist; both facts are in the work rather than in a footnote.
      //
      // This assertion is the reason AUBADE tells each new room it owes this page
      // a paragraph. A floor that ships without moving itself out of the unbuilt
      // list has quietly made the work lie, and the lie is invisible — the page
      // still reads beautifully — so it is checked rather than remembered.
      const everything = prose().join(' ');

      expect(everything).toContain('Floor 0 and Floor −1 exist and the lift runs between them');
      expect(everything).toContain('written and not built');
    });

    it('explains where the hour comes from, without naming a library', () => {
      const everything = prose().join(' ');

      expect(everything).toContain('time zone');
      expect(everything).toContain('equation of time');
      expect(everything).toContain('No library');
    });

    it('offers the invitation, because a daytime reader is the likeliest reader', () => {
      const everything = prose().join(' ');

      expect(everything).toContain('It is meant to be taken.');
    });
  });

  describe('as a page', () => {
    it('gives every section a heading, an id and a body', () => {
      for (const section of EDITION) {
        expect(section.id).toMatch(/^[a-z][a-z-]*$/);
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.paragraphs.length).toBeGreaterThan(0);
      }
    });

    it('gives every section a distinct id, since they are anchor targets', () => {
      const ids = EDITION.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('collides with none of the solar state names', () => {
      // The ids are fragment targets and the states end up in `data-` and class
      // names; an overlap between the two is the sort of thing that works until
      // somebody writes a selector.
      for (const section of EDITION) {
        expect(AUBADE_STATES as readonly string[]).not.toContain(section.id);
      }
    });

    it('offers a way back to the lobby', () => {
      expect(EDITION_RETURN.offer.length).toBeGreaterThan(0);
      expect(EDITION_RETURN.action.length).toBeGreaterThan(0);
    });
  });
});
