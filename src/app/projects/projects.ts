import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FRAME, IProject, PROJECTS } from './projects.data';

/**
 * The `#projects` section of the portfolio.
 *
 * This was `Booking` until the site stopped being a hotel demo and became a
 * résumé: the class kept the old name long after the markup underneath it had
 * been replaced with a project list, which left `src/app/booking/` rendering
 * something with no bookings in it and the real booking demo homeless. The
 * name now matches the section id, the nav link and the anchor.
 *
 * The cards themselves live in `projects.data.ts`; see its header for why.
 */
@Component({
  selector: 'app-projects',
  templateUrl: './projects.html',
  styleUrl: './projects.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projects {
  public readonly projects: readonly IProject[] = PROJECTS;
  public readonly frame = FRAME;
}
