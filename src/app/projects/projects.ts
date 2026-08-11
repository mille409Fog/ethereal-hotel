import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

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
  imports: [ScrollRevealDirective],
  templateUrl: './projects.html',
  styleUrl: './projects.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projects {
  public readonly projects = [
    {
      name: 'Hotel Operations Dashboard',
      description:
        'Occupancy, ADR and RevPAR streamed over a WebSocket, computed from real booking records',
      category: 'Live Demo',
      tech: ['Angular 22', 'RxJS', 'Chart.js', 'FastAPI', 'SQLAlchemy'],
      link: '/dashboard',
    },
    {
      name: 'Room Booking Engine',
      description:
        'A reactive form that writes to a real database — server-side validation rendered on the field that caused it',
      category: 'Live Demo',
      tech: ['Angular 22', 'Reactive Forms', 'FastAPI', 'Pydantic', 'SQLAlchemy'],
      link: '/booking',
    },
    {
      name: 'Revenue Analytics Platform',
      description:
        'GraphQL-powered analytics processing millions of transactions daily with real-time dashboards',
      category: 'Telecommunications',
      tech: ['Angular 22', 'GraphQL', 'TypeScript', 'Azure'],
    },
    {
      name: 'Financial Clearinghouse System',
      description:
        'High-volume transaction processing for major financial institutions with comprehensive audit trails',
      category: 'Finance',
      tech: ['Angular', 'C#', 'T-SQL', 'Blazor'],
    },
    {
      name: 'Device Telemetry Pipeline',
      description: 'Scalable microservices architecture processing IoT data at enterprise scale',
      category: 'Retail',
      tech: ['Java', 'Spring Boot', 'Kafka', 'Microservices'],
    },
  ];
}
