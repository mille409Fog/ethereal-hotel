/**
 * The projects grid, once.
 *
 * Kept apart from `projects.ts`, the way `resume.data.ts` is kept apart from the
 * sections that read it, because two things read this list: the component that
 * renders the cards, and `e2e/project-frames.spec.ts`, which photographs every
 * live route named here and fails when a committed frame no longer matches the
 * app. The spec runs outside Angular and cannot load a decorated class, so the
 * list has to live in a file with no Angular imports. One structure, then, and
 * the card cannot point at a picture the gate does not know about.
 */

/**
 * The size every frame is encoded at, in pixels.
 *
 * 16:10, and twice the width a card is ever drawn at (about 330 CSS pixels in
 * one column on a phone, 300 in three on a desktop), so the picture is sharp
 * at a density of 2. The template passes these as the `<img>`'s `width` and
 * `height`, which is what lets the browser reserve the box before the file
 * arrives; the frame spec asserts that every committed WebP really is this
 * size, so the reservation cannot quietly describe some other picture.
 */
export const FRAME = { width: 720, height: 450 } as const;

/** A committed frame of a live route, as `e2e/project-frames.spec.ts` writes it. */
export interface IProjectFrame {
  /** Served path, under `public/`. */
  readonly src: string;
  /**
   * What the frame shows — the state the route is in, not that it is a
   * screenshot. Every figure in it, and every phrase in “curly quotes”, must
   * appear in the text of the captured region: the frame spec checks, so an
   * alt cannot go on describing a painting that is no longer on the wall.
   */
  readonly alt: string;
}

/**
 * A card in the projects grid.
 *
 * `link` and `linkLabel` travel together and are optional as a pair: the live
 * routes point at themselves, the three NDA engagements point at the case study
 * that explains them, and anything without either renders no button rather
 * than a dead one.
 *
 * `frame` is present exactly when `link` is a route on this site, and the
 * frame spec fails otherwise. The NDA cards have none on purpose: there is no
 * screenshot to show, and a stock picture standing in for one would be the
 * single thing on the page that is not what it looks like.
 */
export interface IProject {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly tech: readonly string[];
  readonly link?: string;
  readonly linkLabel?: string;
  readonly frame?: IProjectFrame;
}

export const PROJECTS: readonly IProject[] = [
  {
    name: 'wanderquest',
    description:
      'a simulation of three travel quests, can you see every state, country, and continent?',
    category: 'interactive',
    tech: ['Angular 22'],
  },
  {
    name: 'murmuration',
    description: 'watch bats dance in the sky, experience wonder',
    category: 'Live Demo',
    tech: ['Angular 22', 'three.js'],
    link: '/murmuration',
    linkLabel: 'watch the murmuration',
    frame: {
      src: '/projects/murmuration.webp',
      alt: 'an entire cauldron of batoids flies wildly lit up against the sky, see what shapes the make.',
    },
  },
  {
    name: 'Hotel Operations Dashboard',
    description:
      'Occupancy, ADR and RevPAR streamed over a WebSocket, computed from real booking records',
    category: 'Live Demo',
    tech: ['Angular 22', 'RxJS', 'Chart.js', 'FastAPI', 'SQLAlchemy'],
    link: '/dashboard',
    linkLabel: 'View Live Demo',
    frame: {
      src: '/projects/dashboard.webp',
      alt: 'The dashboard polling the API: 85.0% occupancy, an ADR of $317, RevPAR of $270 and $16,176 of room revenue today, under a badge that says where the figures came from.',
    },
  },
  {
    name: 'Room Booking Engine',
    description:
      'A reactive form that writes to a real database — server-side validation rendered on the field that caused it',
    category: 'Live Demo',
    tech: ['Angular 22', 'Reactive Forms', 'FastAPI', 'Pydantic', 'SQLAlchemy'],
    link: '/booking',
    linkLabel: 'View Live Demo',
    frame: {
      src: '/projects/booking.webp',
      alt: 'The booking form after the server has rejected a stay with equal dates, its message, “check_out must be after check_in”, shown under the check-out field that caused it.',
    },
  },
  {
    name: 'The Gallery',
    description:
      'Choose a colour, get a painting: 24 public-domain works in 7 groups, every label checked against a source',
    category: 'Interactive',
    tech: ['Angular 22', 'Signals', 'Node', 'WebP'],
    link: '/gallery',
    linkLabel: 'Open the Gallery',
    frame: {
      src: '/projects/gallery.webp',
      alt: 'Crimson chosen, and Van Gogh’s “The Night Café” hung for it in a red frame, beside a label giving where it is, its medium and size, and why it reads as crimson.',
    },
  },
  {
    name: 'The Aesthetic Generator',
    description:
      'Choose one colour from a wheel of 480; the other two are chosen by a published model of colour harmony',
    category: 'Interactive',
    tech: ['Angular 22', 'SVG', 'OKLCH', 'Signals'],
    link: '/aesthetic',
    linkLabel: 'Open the Wheel',
    frame: {
      src: '/projects/aesthetic.webp',
      alt: 'The colour wheel with Rich red, #e63000, chosen as the primary, and markers on the wheel where its two partner colours sit.',
    },
  },
  // The three below are the NDA engagements. Their descriptions are
  // deliberately thin — the argument they make is in the case study, not on
  // the card, and a card that tried to carry it would be the vague-paragraph
  // failure the case-studies ROADMAP item existed to remove.
  {
    name: 'Revenue Analytics Platform',
    description: 'One CI/CD pipeline, six frontends, and a framework upgrade that split them',
    category: 'Telecommunications',
    tech: ['Angular 22', 'GraphQL', 'TypeScript', 'Azure'],
    link: '/work#pipeline-fork',
    linkLabel: 'Read the Case Study',
  },
  {
    name: 'Financial Clearinghouse System',
    description: 'A reconciliation cutover designed on paper, because the tools were gated',
    category: 'Finance',
    tech: ['Angular', 'C#', 'T-SQL', 'Blazor'],
    link: '/work#design-before-access',
    linkLabel: 'Read the Case Study',
  },
  {
    name: 'Device Telemetry Pipeline',
    description: 'A schema change across stores that could never land everywhere at once',
    category: 'Retail',
    tech: ['Java', 'Spring Boot', 'Kafka', 'Microservices'],
    link: '/work#two-phase-schema',
    linkLabel: 'Read the Case Study',
  },
];
