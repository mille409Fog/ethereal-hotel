import { FLOORS } from '../descent';
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
 *
 * The ceiling used to carry a forecast. Every phase converts one of the six floor
 * entries from a sketch of a room into a description of one, at forty or fifty
 * words a time, so a ceiling set tight against the total of the day was a gate
 * that failed on the next phase for a reason that was not the reason it exists —
 * it was seven words clear when the Cellar landed, which is a gate measuring the
 * wrong thing. Nineteen hundred budgeted the rooms still to come.
 *
 * **That budget is now spent.** The Box was the last of the six, so there is no
 * further phase for the headroom to be held against, and the number below is a
 * ceiling over a finished page rather than a forecast over an unfinished one.
 * It is set about four per cent above the real total, which is tighter in intent
 * than nineteen hundred ever was even though it is a larger number: what it now
 * catches is any growth at all, rather than growth beyond an allowance.
 *
 * If a later phase does need room here — a seventh floor, or the Box's silence
 * becoming a paragraph about sound — the honest move is to spend words somewhere
 * else on the page rather than to raise this again. Twelve hundred is the
 * requirement and two thousand is already generous against it.
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
      expect(count).toBeLessThan(2150);
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

    it('names every floor and says that all of them are built', () => {
      // The one place the fiction and the truth land on the same sentence.
      // Everything on this page is present tense, and the page has to say plainly
      // how much of that present tense is real — in the work rather than in a
      // footnote.
      //
      // This assertion is the reason AUBADE tells each room it owes this page a
      // paragraph. It used to guard the other direction, when some of the six were
      // written and unbuilt; all six exist now, so what it guards is the claim that
      // they do. Either way the lie would be invisible — the page still reads
      // beautifully — so it is checked rather than remembered.
      //
      // Derived from `FLOORS` rather than written out, and that is the whole point
      // of the check. Spelled as a literal it was a string somebody had to remember
      // to edit in the same commit that shipped a floor, which is exactly the class
      // of thing this test exists because people forget. Built from the shaft's own
      // list it fails the moment a floor exists and the page has not said so, and it
      // needs no maintenance when the next one lands.
      const named = FLOORS.map((floor) => `Floor ${floor === 0 ? '0' : `−${-floor}`}`);
      const built = `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;

      const everything = prose().join(' ');

      // Spelled as a word because the page is prose, and derived for the same
      // reason the list above is: a literal is something somebody has to remember
      // to edit in the commit that ships a floor.
      const count = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

      expect(everything).toContain(`${built} exist and the lift runs between them`);
      expect(everything).toContain(`All ${count[FLOORS.length]} are built`);
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
