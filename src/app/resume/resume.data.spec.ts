import { formatMonth, formatPeriod, IJob, RESUME } from './resume.data';

/**
 * The résumé's invariants.
 *
 * Two of these matter more than the rest. The ordering and overlap checks exist
 * because the dates are the one part a reader will actually verify against
 * LinkedIn, and a typo in a month is invisible on screen and permanent in a
 * PDF. The bullet ceiling exists because the PDF is one page by design: a
 * fourth bullet does not look like a layout bug in the data file, it looks like
 * a fourth bullet, and it is only wrong once printed.
 *
 * Worth noting the inversion against `work.data.spec.ts`, which fails the build
 * if a case study so much as says "Charter". These are the same employers seen
 * from the other side: the case studies describe work under NDA and must name
 * nobody, the résumé is a record of employment and must name everybody. Both
 * files assert their rule rather than trusting a proofread, which is the only
 * reason two opposite rules can live in one repo safely.
 */

/** `YYYY-MM` → a sortable integer, so month arithmetic needs no Date. */
function ordinal(month: string): number {
  const [year, index] = month.split('-').map(Number);
  return year * 12 + index;
}

describe('résumé data', () => {
  describe('dates', () => {
    it('writes every month as YYYY-MM', () => {
      for (const job of RESUME.experience) {
        expect(job.start, `${job.company} start`).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
        if (job.end !== null) {
          expect(job.end, `${job.company} end`).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
        }
      }
    });

    it('ends every job after it starts', () => {
      for (const job of RESUME.experience) {
        if (job.end === null) continue;
        expect(ordinal(job.end), `${job.company} ends before it starts`).toBeGreaterThan(
          ordinal(job.start)
        );
      }
    });

    it('lists jobs newest first', () => {
      const starts = RESUME.experience.map((job) => ordinal(job.start));
      const sorted = [...starts].sort((a, b) => b - a);
      expect(starts, 'experience is not in reverse-chronological order').toEqual(sorted);
    });

    it('never overlaps two positions', () => {
      // Walking newest-to-oldest, each job must start no earlier than the
      // previous one ended. Equality is fine and is in fact the current data:
      // one role starting the month the last one finished.
      for (let i = 0; i < RESUME.experience.length - 1; i++) {
        const newer = RESUME.experience[i];
        const older = RESUME.experience[i + 1];
        expect(older.end, `${older.company} must have an end date`).not.toBeNull();
        expect(
          ordinal(newer.start),
          `${newer.company} starts before ${older.company} ended`
        ).toBeGreaterThanOrEqual(ordinal(older.end as string));
      }
    });

    it('claims no month in the future', () => {
      const now = new Date();
      const today = now.getUTCFullYear() * 12 + (now.getUTCMonth() + 1);
      for (const job of RESUME.experience) {
        expect(ordinal(job.start), `${job.company} starts in the future`).toBeLessThanOrEqual(
          today
        );
      }
    });

    it('marks exactly one job as current', () => {
      const current = RESUME.experience.filter((job) => job.end === null);
      expect(current.length, 'exactly one role should be open-ended').toBe(1);
      // …and it must be the newest, or the page prints "Present" halfway down.
      expect(RESUME.experience[0].end).toBeNull();
    });
  });

  describe('shape the PDF depends on', () => {
    it('keeps every job to three bullets or fewer', () => {
      for (const job of RESUME.experience) {
        expect(
          job.bullets.length,
          `${job.company} has ${job.bullets.length} bullets`
        ).toBeLessThanOrEqual(3);
        expect(job.bullets.length, `${job.company} has no bullets`).toBeGreaterThan(0);
      }
    });

    it('leaves no string blank', () => {
      const strings = [
        RESUME.name,
        RESUME.role,
        RESUME.summary,
        RESUME.availability,
        ...Object.values(RESUME.contact),
        ...RESUME.preferredRoles,
        ...RESUME.experience.flatMap((job) => [
          job.title,
          job.company,
          ...job.bullets,
          ...job.tech,
        ]),
        ...RESUME.skills.flatMap((category) => [category.name, ...category.skills]),
        RESUME.education.degree,
        RESUME.education.institution,
        ...RESUME.education.certifications,
      ];
      for (const value of strings) {
        expect(value.trim().length, `"${value}" is blank`).toBeGreaterThan(0);
      }
    });

    it('gives every skill category at least one skill and no duplicates', () => {
      for (const category of RESUME.skills) {
        expect(category.skills.length, `${category.name} is empty`).toBeGreaterThan(0);
        expect(new Set(category.skills).size, `${category.name} repeats a skill`).toBe(
          category.skills.length
        );
      }
    });

    it('writes contact details in the form the PDF prints them', () => {
      // No scheme on the links: they are printed and read, not clicked, and
      // "https://" spends a third of the line telling the reader nothing.
      expect(RESUME.contact.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
      for (const link of [RESUME.contact.linkedin, RESUME.contact.github, RESUME.contact.site]) {
        expect(link, `"${link}" should not carry a scheme`).not.toMatch(/^https?:\/\//);
      }
    });
  });

  describe('formatMonth', () => {
    it('renders a month as its English name and year', () => {
      expect(formatMonth('2023-06')).toBe('June 2023');
      expect(formatMonth('2018-08')).toBe('August 2018');
      expect(formatMonth('2021-01')).toBe('January 2021');
      expect(formatMonth('1999-12')).toBe('December 1999');
    });

    it('throws rather than printing a malformed date', () => {
      // The failure mode this guards is "undefined NaN" reaching a recruiter,
      // so every one of these has to be loud rather than best-effort.
      for (const bad of ['2023-6', '2023', 'June 2023', '2023-00', '2023-13', '', '2023-06-01']) {
        expect(() => formatMonth(bad), `"${bad}" should be rejected`).toThrow(RangeError);
      }
    });
  });

  describe('formatPeriod', () => {
    const job = (start: string, end: string | null): IJob => ({
      title: 'Engineer',
      company: 'Somewhere',
      start,
      end,
      bullets: ['Did the thing'],
      tech: ['TypeScript'],
    });

    it('joins both ends with an en dash', () => {
      expect(formatPeriod(job('2021-03', '2023-06'))).toBe('March 2021 – June 2023');
    });

    it('prints an open-ended role as Present', () => {
      expect(formatPeriod(job('2023-06', null))).toBe('June 2023 – Present');
    });

    it('formats every real job without throwing', () => {
      for (const real of RESUME.experience) {
        expect(formatPeriod(real)).toMatch(/^[A-Z][a-z]+ \d{4} – ([A-Z][a-z]+ \d{4}|Present)$/);
      }
    });
  });
});
