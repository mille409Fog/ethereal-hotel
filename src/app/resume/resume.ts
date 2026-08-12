import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';
import { ANALYTICS_EVENTS, AnalyticsService } from '../services/analytics.service';

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
