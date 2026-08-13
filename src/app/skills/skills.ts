import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';
import { RESUME } from '../resume/resume.data';

@Component({
  selector: 'app-skills',
  imports: [ScrollRevealDirective],
  templateUrl: './skills.html',
  styleUrl: './skills.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skills {
  /** The same list the PDF prints. See `resume.data.ts`. */
  public readonly skillCategories = RESUME.skills;
}
