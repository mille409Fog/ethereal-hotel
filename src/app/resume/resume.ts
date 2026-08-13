import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';
import { ANALYTICS_EVENTS, AnalyticsService } from '../services/analytics.service';
import { RESUME } from './resume.data';

@Component({
  selector: 'app-resume',
  imports: [ScrollRevealDirective],
  templateUrl: './resume.html',
  styleUrl: './resume.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Resume {
  private readonly analytics = inject(AnalyticsService);

  /**
   * The contact card reads from the same structure the PDF is rendered from, so
   * "the same history as this page, on one page" is now enforced rather than
   * merely claimed. See `resume.data.ts`.
   */
  public readonly contact = RESUME.contact;
  public readonly education = RESUME.education;
  public readonly availability = RESUME.availability;
  public readonly preferredRoles = RESUME.preferredRoles.join(', ');
  public readonly certifications = RESUME.education.certifications.join(', ');

  /**
   * The links carry no scheme in the data — they are printed on the résumé,
   * where `https://` is three centimetres of nothing — so the site puts it back
   * for the `href` while still displaying the bare form.
   */
  public readonly linkedinHref = `https://${RESUME.contact.linkedin}`;
  public readonly githubHref = `https://${RESUME.contact.github}`;

  /**
   * Record a resume download.
   *
   * Bound to `(click)` and deliberately does nothing else — the `href` and the
   * `download` attribute do the work, so the file still arrives for a middle
   * click, a right-click "Save link as", a keyboard activation with JavaScript
   * half-loaded, and every other path that never reaches this method. Which is
   * also the honest caveat on the number: this counts clicks that went through
   * the anchor, not downloads that completed.
   */
  public onResumeDownload(): void {
    this.analytics.track(ANALYTICS_EVENTS.resumeDownloaded);
  }
}
