import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';
import { formatPeriod, RESUME } from '../resume/resume.data';

@Component({
  selector: 'app-experience',
  imports: [ScrollRevealDirective],
  templateUrl: './experience.html',
  styleUrl: './experience.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Experience {
  /**
   * The same positions the PDF prints, from the same structure — see
   * `resume.data.ts` for why they stopped living here.
   *
   * The display period is derived once, at construction, rather than by calling
   * `formatPeriod` from the template: the data is static, and a function call in
   * a binding re-runs on every change detection cycle for a string that cannot
   * have changed.
   */
  public readonly jobs = RESUME.experience.map((job) => ({
    ...job,
    period: formatPeriod(job),
  }));
}
