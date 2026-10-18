import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A card in the projects grid.
 *
 * `link` and `linkLabel` travel together and are optional as a pair: the two
 * live demos point at their own routes, the three NDA engagements point at the
 * case study that explains them, and anything without either renders no button
 * rather than a dead one.
 */
interface IProject {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly tech: readonly string[];
  readonly link?: string;
  readonly linkLabel?: string;
}

/**
 * The `#projects` section of the portfolio.
 *
 * This was `Booking` until the site stopped being a hotel demo and became a
 * résumé: the class kept the old name long after the markup underneath it had
 * been replaced with a project list, which left `src/app/booking/` rendering
 * something with no bookings in it and the real booking demo homeless. The
 * name now matches the section id, the nav link and the anchor.
 */
@Component({
  selector: 'app-projects',
  templateUrl: './projects.html',
  styleUrl: './projects.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projects {
  public readonly projects: readonly IProject[] = [
    {
      name: 'Hotel Operations Dashboard',
      description:
        'Occupancy, ADR and RevPAR streamed over a WebSocket, computed from real booking records',
      category: 'Live Demo',
      tech: ['Angular 22', 'RxJS', 'Chart.js', 'FastAPI', 'SQLAlchemy'],
      link: '/dashboard',
      linkLabel: 'View Live Demo',
    },
    {
      name: 'Room Booking Engine',
      description:
        'A reactive form that writes to a real database — server-side validation rendered on the field that caused it',
      category: 'Live Demo',
      tech: ['Angular 22', 'Reactive Forms', 'FastAPI', 'Pydantic', 'SQLAlchemy'],
      link: '/booking',
      linkLabel: 'View Live Demo',
    },
    {
      name: 'The Gallery',
      description:
        'Choose a colour, get a painting: 24 public-domain works in 7 groups, every label checked against a source',
      category: 'Interactive',
      tech: ['Angular 22', 'Signals', 'Node', 'WebP'],
      link: '/gallery',
      linkLabel: 'Open the Gallery',
    },
    {
      name: 'The Aesthetic Generator',
      description:
        'Choose one colour from a wheel of 480; the other two are chosen by a published model of colour harmony',
      category: 'Interactive',
      tech: ['Angular 22', 'SVG', 'OKLCH', 'Signals'],
      link: '/aesthetic',
      linkLabel: 'Open the Wheel',
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
}
