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
 * So this is the source. The three components read from it, and
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

  /** First month in the role, `YYYY-MM`. */
  readonly start: string;

  /** Last month in the role, `YYYY-MM`, or `null` while it is current. */
  readonly end: string | null;

  /**
   * What the role actually produced. Kept to three so the PDF stays one page —
   * `resume.data.spec.ts` enforces the ceiling rather than trusting a proofread,
   * because a fourth bullet does not look like a layout bug until it is printed.
   */
  readonly bullets: readonly string[];

  /** Shown as badges on the site and as a single dense line in the PDF. */
  readonly tech: readonly string[];
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
  readonly certifications: readonly string[];
}

export interface IResume {
  readonly name: string;
  readonly role: string;

  /**
   * The opening paragraph. Shares its wording with the hero on purpose — this
   * is the site's own claim about itself, minus the closing call to action,
   * which reads as an invitation on a web page and as a non sequitur on a
   * printed résumé.
   */
  readonly summary: string;

  readonly contact: IContact;

  /** Newest first. `resume.data.spec.ts` enforces the order and the continuity. */
  readonly experience: readonly IJob[];

  readonly skills: readonly ISkillCategory[];
  readonly education: IEducation;

  /** One line, shown on the site's contact card only. */
  readonly availability: string;

  /** The roles being sought, listed on the site and under the PDF's summary. */
  readonly preferredRoles: readonly string[];
}

export const RESUME: IResume = {
  name: 'Jacob Miller',
  role: 'Senior Software Engineer',
  summary:
    'I build scalable, high-performance applications across the full stack. Specializing in ' +
    "Angular, C#, Java, and modern cloud architectures, I've delivered enterprise solutions for " +
    'telecommunications, finance, and retail at scale.',
  contact: {
    email: 'millerjacob67@gmail.com',
    phone: '720-636-1085',
    location: 'Denver, CO',
    linkedin: 'linkedin.com/in/jacob-miller-485603146',
    github: 'github.com/mille409Fog',
    site: 'ethereal-hotel-pink.vercel.app',
  },
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Charter Communications',
      start: '2023-06',
      end: null,
      bullets: [
        'Architected and launched multiple revenue-generating features across the full stack using Angular 22 and GraphQL',
        'Hardened enterprise data pipelines processing millions of daily transactions with improved reliability',
        'Led codebase modernization initiative improving developer velocity and maintainability',
      ],
      tech: ['Angular 22', 'GraphQL', 'TypeScript', 'Azure', 'CI/CD'],
    },
    {
      title: 'Software Engineer',
      company: 'Feature 23',
      start: '2021-03',
      end: '2023-06',
      bullets: [
        'Built enterprise Angular/C#/Blazor application handling high-volume transactions for financial clearinghouse',
        'Developed government tax filing platform using Angular, C#, and SQL on Azure Government cloud',
        'Established comprehensive testing strategy with XUnit and Selenium',
      ],
      tech: ['Angular', 'C#', 'Blazor', 'T-SQL', 'Azure'],
    },
    {
      title: 'Software Engineer',
      company: 'Walmart Labs',
      start: '2018-08',
      end: '2021-03',
      bullets: [
        'Engineered Java/Spring microservices processing device telemetry data at retail scale',
        'Built dynamic financial management application in Angular 8 with fully configurable fields',
        'Achieved broad test coverage with JUnit, Serenity, and Karma',
      ],
      tech: ['Java', 'Spring Boot', 'Angular 8', 'Microservices'],
    },
  ],
  skills: [
    {
      name: 'Frontend',
      skills: ['Angular', 'React', 'TypeScript', 'JavaScript', 'HTML/CSS', 'RxJS', 'NgRx'],
    },
    {
      name: 'Backend',
      skills: ['C#', 'Java', 'Node.js', 'ASP.NET', 'Spring Boot', 'REST APIs', 'GraphQL'],
    },
    {
      name: 'Database',
      skills: ['T-SQL', 'SQL Server', 'PostgreSQL', 'Hibernate', 'Entity Framework'],
    },
    {
      name: 'Cloud & DevOps',
      skills: ['Azure', 'AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Jenkins'],
    },
    {
      name: 'Testing',
      skills: ['XUnit', 'JUnit', 'Karma', 'Jasmine', 'Selenium', 'Serenity'],
    },
    {
      name: 'Architecture',
      skills: ['Microservices', 'Event-Driven', 'Domain-Driven Design', 'SOLID', 'Design Patterns'],
    },
  ],
  education: {
    degree: 'B.S. Mathematics',
    institution: 'Western Washington University',
    year: 2016,
    certifications: ['SOA Exam P (2017)', 'SOA Exam FM (2018)'],
  },
  availability: 'Currently employed and open to discussing new opportunities.',
  preferredRoles: ['Senior Software Engineer', 'Tech Lead', 'Solution Architect'],
};

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
