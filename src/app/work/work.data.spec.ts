import { CASE_STUDIES, ICaseStudy } from './work.data';

/**
 * The disclosure gate.
 *
 * The case-studies ROADMAP item's DoD asked for three properties that are easy to assert and
 * easy to lose: the studies name nothing confidential, each one states what its
 * decision cost, and each ends on a number. Those are exactly the things that
 * erode under editing — a name gets added back for clarity, a cost gets folded
 * into the decision sentence, a number gets softened into "significantly".
 *
 * Checking them here rather than trusting a proofread follows the same rule as
 * `scripts/check-docs.mjs`: a claim worth writing down is worth failing a build
 * over. It is also why the studies are data — prose in a template cannot be
 * asserted against.
 *
 * The deny-list is the load-bearing part. It is not a filter the writing is run
 * through; it is a tripwire on writing that is supposed to already be clean.
 */

/**
 * Proper nouns that must never appear. Employers and their brands, the
 * industries' named systems, and the platform names that would identify an
 * engagement by elimination.
 *
 * Matched case-insensitively on word boundaries against every string field.
 * Add to this list when a new engagement is written up — the point is that it
 * fails loudly rather than that it is exhaustive.
 */
const FORBIDDEN = [
  'Charter',
  'Spectrum',
  'Walmart',
  'Feature 23',
  'Feature23',
  'Bentonville',
  'Stamford',
];

/** Every human-readable string in a study, flattened for scanning. */
function proseOf(study: ICaseStudy): string {
  const options = study.options.flatMap((option) => [option.label, option.detail]);
  return [
    study.title,
    study.domain,
    study.context,
    study.constraint,
    study.decision,
    study.cost,
    study.outcome,
    ...options,
  ].join(' ');
}

/** Word count of the study as a reader meets it, options included. */
function wordCount(study: ICaseStudy): number {
  return proseOf(study)
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

describe('case study data', () => {
  it('names no employer, client, or platform that would identify one', () => {
    for (const study of CASE_STUDIES) {
      const prose = proseOf(study);
      for (const term of FORBIDDEN) {
        // Word boundaries so a legitimate substring cannot trip it, and so the
        // failure message says which study and which term.
        const pattern = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i');
        expect(pattern.test(prose), `"${study.slug}" mentions "${term}"`).toBe(false);
      }
    }
  });

  it('states what each decision cost', () => {
    for (const study of CASE_STUDIES) {
      expect(study.cost.trim().length, `"${study.slug}" has no cost`).toBeGreaterThan(0);
    }
  });

  it('ends each study on a number', () => {
    for (const study of CASE_STUDIES) {
      // A digit, or one of the small integers people write out in prose.
      // "Roughly half" is a number; "significantly" is not.
      const hasFigure =
        /\d|\b(half|third|quarter|twice|double|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
          study.outcome
        );
      expect(hasFigure, `"${study.slug}" outcome states no number`).toBe(true);
    }
  });

  it('offers real alternatives, one of them the conventional pick', () => {
    for (const study of CASE_STUDIES) {
      expect(study.options.length, `"${study.slug}" needs 2-3 options`).toBeGreaterThanOrEqual(2);
      expect(study.options.length, `"${study.slug}" needs 2-3 options`).toBeLessThanOrEqual(3);

      const conventional = study.options.filter((option) => option.conventional);
      expect(
        conventional.length,
        `"${study.slug}" must mark exactly one option as the usual choice`
      ).toBe(1);
    }
  });

  it('runs 250-400 words', () => {
    for (const study of CASE_STUDIES) {
      const words = wordCount(study);
      expect(words, `"${study.slug}" is ${words} words`).toBeGreaterThanOrEqual(250);
      expect(words, `"${study.slug}" is ${words} words`).toBeLessThanOrEqual(400);
    }
  });

  /**
   * Every other test in this file passes vacuously on an empty array, which is
   * the correct behaviour while the studies are being written and a silent hole
   * once they are. This is the one that notices.
   *
   * Zero or three, never one or two: the route is linked from the hero, and a
   * page promising case studies that shows a single finished one reads as a
   * site mid-edit. Empty is a state the page renders honestly; partial is not.
   */
  it('is either unwritten or complete', () => {
    expect([0, 3]).toContain(CASE_STUDIES.length);
  });

  it('gives every study a unique slug', () => {
    const slugs = CASE_STUDIES.map((study) => study.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
