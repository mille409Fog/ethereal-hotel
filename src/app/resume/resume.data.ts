/**
 * The résumé, once.
 *
 * Before this file the same history existed three times: `jobs` in
 * `experience.ts`, `skillCategories` in `skills.ts`, education and contact
 * details hardcoded into `resume.html`, and — the copy that actually mattered —
 * a PDF built by hand in LibreOffice and committed as a binary. Four copies,
 * one of them unreadable without a PDF parser, all of them free to disagree.
 * A site whose entire argument is that its numbers are real cannot ship a
 * résumé that contradicts itself.
 *
 * So this is the source. The experience and contact sections read from it, and
 * `scripts/render-resume.mjs` renders it to `public/jacob-miller-resume.pdf`
 * through headless Chromium. Nothing writes the PDF by hand any more, and CI
 * fails when the committed one stops matching this file.
 *
 * Node 22.18+ strips TypeScript types natively, which is the whole reason this
 * is `.ts` rather than JSON: the render script imports it directly
 * (`./resume.data.ts`, extension required) while Angular imports it
 * extensionlessly, so one typed structure with real doc comments feeds both
 * without a build step or a generated copy. Keep the syntax *erasable* —
 * interfaces, type annotations and `as const` are fine; `enum`, `namespace` and
 * parameter properties are not, and would break the script with a Node syntax
 * error rather than a type error.
 *
 * Dates are stored as `YYYY-MM` and formatted for display by `formatPeriod`.
 * That is not tidiness: a period written as prose cannot be checked for
 * ordering or overlap, and `resume.data.spec.ts` checks both.
 */

/** One position. */
export interface IJob {
  readonly title: string;
  readonly company: string;
  readonly location: string;

  /** First month in the role, `YYYY-MM`. */
  readonly start: string;

  /** Last month in the role, `YYYY-MM`, or `null` while it is current. */
  readonly end: string | null;

  /**
   * What the role actually produced, at most five and each about two printed
   * lines. `resume.data.spec.ts` enforces the ceiling, and the renderer's
   * one-page check is what actually decides whether another one fits.
   *
   * `**…**` marks the figure a skimming reader should land on, and nothing
   * else — bold a phrase and the page has no emphasis at all. Read it through
   * `emphasis()`, never by printing the string.
   */
  readonly bullets: readonly string[];

  /** Shown as badges on the site. The PDF leaves them out: its bullets name the stack. */
  readonly tech: readonly string[];
}

/** Side work worth a line, with links a reader can type. */
export interface IProject {
  readonly name: string;

  /** Without scheme, like the contact links, and for the same reason. */
  readonly links: readonly string[];

  readonly stack: readonly string[];
  readonly summary: string;
}

/** One labelled group of technologies. */
export interface ISkillCategory {
  readonly name: string;
  readonly skills: readonly string[];
}

/** Where to reach him. Rendered on the site and in the PDF's header. */
export interface IContact {
  readonly email: string;
  readonly phone: string;
  readonly location: string;
  readonly linkedin: string;
  readonly github: string;

  /**
   * The deployed site, without scheme — it is printed, so it is read by a human
   * and typed by hand rather than clicked. One place to change when the custom
   * domain lands.
   */
  readonly site: string;
}

/** Degree and the exams after it. */
export interface IEducation {
  readonly degree: string;
  readonly institution: string;
  readonly year: number;

  /** Printed on the degree's line in the PDF; the site's card has no room for them. */
  readonly honors: readonly string[];

  readonly certifications: readonly string[];
}

export interface IResume {
  readonly name: string;
  readonly role: string;

  /**
   * The opening paragraph, held to two printed lines. It used to share its
   * wording with the hero, which put "scalable, high-performance" at the top of
   * the résumé too; it now says only what the experience below can back, and
   * the hero's copy is the ROADMAP's business.
   */
  readonly summary: string;

  readonly contact: IContact;

  /** Newest first. `resume.data.spec.ts` enforces the order and the continuity. */
  readonly experience: readonly IJob[];

  readonly projects: readonly IProject[];
  readonly skills: readonly ISkillCategory[];
  readonly education: IEducation;

  /**
   * The roles being sought, or `null` when not looking. This is the off switch:
   * `availabilityLine` turns it into the hero's "Open to … roles" line and the
   * contact card's Availability block, and both render under an `@if`, so one
   * `null` here removes the claim everywhere rather than leaving it to go stale
   * on one of them. The PDF never prints it — a résumé outlives the search.
   */
  readonly openTo: readonly string[] | null;
}

const GITHUB = 'github.com/mille409Fog';

export const RESUME: IResume = {
  name: 'Jacob Miller',
  role: 'Senior Software Engineer',
  summary:
    'Senior full-stack engineer with 8+ years building payment, transaction and regulated ' +
    'systems for telecom, fintech, retail and government: Angular and React front ends over ' +
    'C#/.NET, Java/Spring, Node.js and Python.',
  contact: {
    email: 'millerjacob67@gmail.com',
    phone: '720-636-1085',
    location: 'Denver, CO',
    linkedin: 'linkedin.com/in/jacob-miller-485603146',
    github: GITHUB,
    site: 'jacobmiller.dev',
  },
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Charter Communications (Spectrum)',
      location: 'Denver, CO',
      start: '2023-06',
      end: '2026-10',
      bullets: [
        "Designed and launched new revenue flows on Spectrum's web, iOS and Android apps, reaching " +
          '**30M+ customers** and generating multi-million-dollar revenue.',
        'Owned each flow from concept to launch: Angular UX from Figma designs through GraphQL ' +
          'APIs, pricing and payment exchange, released behind feature flags, A/B tests and canaries.',
        'Built continuous mutation testing into AI-assisted test generation when Kiro adoption ' +
          'surged MR volume; built in a week, adopted org-wide in two, **cutting bug reports 40%**.',
        'Led modernization of **~50 services** on a proprietary framework; hardened data ' +
          'pipelines, **cutting failures ~20%**.',
        'Reviewed merge requests, mentored engineers, maintained a proprietary UI component ' +
          'library, and served on call.',
      ],
      tech: ['Angular', 'TypeScript', 'GraphQL', 'Feature flags', 'A/B testing'],
    },
    {
      title: 'Software Engineer',
      company: 'Feature 23',
      location: 'Denver, CO',
      start: '2021-03',
      end: '2023-06',
      bullets: [
        'Built an enterprise web application (Angular, C#, Blazor, T-SQL) handling high-volume ' +
          'transaction flows for a major financial clearinghouse, covered by xUnit and Selenium.',
        'Built a government tax filing application on Azure Government, to its security and ' +
          'regulatory standards.',
        'Wrote third-party sync code against reverse-engineered vendor schemas, with retries, ' +
          'backoff and idempotent writes.',
        'Built mobile features in Swift (an iOS therapy-dog app serving veterans) and Kotlin (Android).',
      ],
      tech: ['Angular', 'C#', 'Blazor', 'T-SQL', 'Azure Government', 'Swift', 'Kotlin'],
    },
    {
      title: 'Software Engineer',
      company: 'Walmart Labs',
      location: 'Bentonville, AR',
      start: '2018-08',
      end: '2021-03',
      bullets: [
        "Built Java/Spring Boot microservices processing POS terminal telemetry across Walmart's " +
          'U.S. store network, a parallel Node.js/Meteor.js service suite, and its full React front end.',
        'Built a financial management app with fully configurable fields (Angular, Java/Spring), ' +
          'tested with JUnit, Serenity and Karma.',
      ],
      tech: ['Java', 'Spring Boot', 'Node.js', 'React', 'Angular'],
    },
  ],
  projects: [
    {
      name: 'Hotel Operations Demo',
      links: ['jacobmiller.dev', `${GITHUB}/ethereal-hotel`],
      stack: ['Angular', 'FastAPI', 'Vercel'],
      summary:
        'Full-stack app where every on-screen number comes from a real database row; built with ' +
        'Claude Code, reviewed by hand.',
    },
    {
      name: 'ATS Screener',
      links: [`${GITHUB}/ats-screener`],
      stack: ['Python', 'pytest', 'GitHub Actions'],
      summary:
        'CLI checking PDF parsing, keyword coverage and knockout criteria against a job posting; ' +
        'Claude API rubric; 38 tests.',
    },
  ],
  skills: [
    {
      name: 'Languages',
      skills: ['TypeScript', 'JavaScript', 'C#', 'Java', 'Python', 'SQL', 'Swift', 'Kotlin', 'F#'],
    },
    {
      name: 'Frontend',
      skills: [
        'Angular',
        'React',
        'RxJS',
        'Blazor',
        'SwiftUI',
        'Android',
        'component libraries',
        'accessibility',
      ],
    },
    {
      name: 'Backend & data',
      skills: [
        'ASP.NET Core',
        'EF Core',
        'Spring Boot',
        'Node.js',
        'FastAPI',
        'Django',
        'GraphQL',
        'REST',
        'SQL Server',
        'PostgreSQL',
      ],
    },
    {
      name: 'Delivery',
      skills: [
        'GitLab CI/CD',
        'Azure DevOps',
        'Docker',
        'AWS EKS',
        'Azure',
        'Splunk',
        'Azure Monitor',
        'feature flags',
        'YAML IaC',
      ],
    },
    {
      name: 'Testing',
      skills: [
        'Jest',
        'Karma',
        'pytest',
        'xUnit',
        'JUnit',
        'Selenium',
        'Serenity',
        'mutation testing',
      ],
    },
    {
      name: 'AI-assisted',
      skills: ['Claude Code daily', 'agentic workflows with sub-agents', 'every change tested'],
    },
  ],
  education: {
    degree: 'B.S. Mathematics',
    institution: 'Western Washington University',
    year: 2016,
    honors: ['Putnam exam representative', 'Phi Eta Sigma', 'Golden Key'],
    certifications: [
      'SOA Exam P — Probability (2017)',
      'SOA Exam FM — Financial Mathematics (2018)',
    ],
  },
  openTo: ['Senior Software Engineer', 'Tech Lead', 'Solution Architect'],
};

/**
 * `['A', 'B', 'C']` → `Open to A, B or C roles.` Throws on an empty list, which
 * would otherwise print "Open to  roles." — not looking is `null`, not `[]`.
 */
export function availabilityLine(roles: readonly string[]): string {
  if (roles.length === 0) {
    throw new RangeError('openTo is empty; set it to null to stop looking');
  }
  const head = roles.slice(0, -1);
  const last = roles[roles.length - 1];
  return `Open to ${head.length > 0 ? `${head.join(', ')} or ${last}` : last} roles.`;
}

/** A run of bullet text, emphasised or not. */
export interface ISegment {
  readonly text: string;
  readonly strong: boolean;
}

/**
 * Split a bullet on its `**…**` markers. Throws on an unpaired marker, because
 * the alternative is a pair of asterisks printed in front of a recruiter.
 */
export function emphasis(bullet: string): readonly ISegment[] {
  const parts = bullet.split('**');
  if (parts.length % 2 === 0) {
    throw new RangeError(`Unpaired ** in "${bullet}"`);
  }
  return parts
    .map((text, index) => ({ text, strong: index % 2 === 1 }))
    .filter((segment) => segment.text.length > 0);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * `2023-06` → `June 2023`. Throws on anything else, because a malformed date
 * that renders as `undefined NaN` in a PDF is the kind of defect that reaches a
 * recruiter before it reaches a test.
 */
export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) {
    throw new RangeError(`Expected a YYYY-MM month, got "${month}"`);
  }
  const index = Number(match[2]) - 1;
  const name = MONTHS[index];
  if (name === undefined) {
    throw new RangeError(`"${month}" is not a real month`);
  }
  return `${name} ${match[1]}`;
}

/** `June 2023 – Present`, the em-dashed form both the site and the PDF print. */
export function formatPeriod(job: IJob): string {
  return `${formatMonth(job.start)} – ${job.end === null ? 'Present' : formatMonth(job.end)}`;
}
