import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RESUME } from '../resume/resume.data';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  public readonly currentYear = new Date().getFullYear();

  /**
   * Built on the profile in `resume.data.ts` rather than typed out, so the
   * handle lives in one place. The repository's name does not: it is this
   * repository, and nothing else would ever change it.
   */
  public readonly repository = `${RESUME.contact.github}/ethereal-hotel`;
  public readonly repositoryHref = `https://${this.repository}`;
}
