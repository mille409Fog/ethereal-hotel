import { ChangeDetectionStrategy, Component } from '@angular/core';
import { availabilityLine, RESUME } from '../resume/resume.data';

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  /**
   * The first screen, so a reader can reach the owner without scrolling past
   * the experience section to the contact card. `null` when not looking, and
   * the line goes with it; see `openTo` in `resume.data.ts`.
   */
  public readonly availability = RESUME.openTo === null ? null : availabilityLine(RESUME.openTo);

  public readonly email = RESUME.contact.email;
  public readonly mailto = `mailto:${RESUME.contact.email}`;
}
