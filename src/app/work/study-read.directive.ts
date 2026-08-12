import { DestroyRef, Directive, ElementRef, OnInit, inject, input } from '@angular/core';
import { ANALYTICS_EVENTS, AnalyticsService } from '../services/analytics.service';

/**
 * How long a study must have been on screen before reaching its end counts as
 * having read it.
 *
 * The three studies run about 400 words each, so even a 400wpm skimmer needs
 * roughly a minute. This is therefore not an estimate of reading time and
 * should not be tuned as though it were: it is a floor under "did not simply
 * scroll past", set far enough below plausible reading that it never rejects a
 * real reader, and far enough above a flick of the scroll wheel that it never
 * accepts one.
 */
export const MINIMUM_DWELL_MS = 20_000;

/**
 * Whether a case study has been read rather than scrolled past.
 *
 * Both conditions must hold: the reader reached the end of the study, **and**
 * the study has been on screen for at least `minimumDwellMs` by `nowMs`.
 *
 * Dwell is measured from `firstSeenAtMs` to `nowMs`, and reaching the end is
 * only a flag, because those are two independent facts rather than two points
 * on a line. On a tall screen an entire study can be visible at once, so
 * "started" and "reached the end" are the same instant; a rule that measured
 * the gap between them would score that reader zero however long they sat
 * there. `nowMs` is a parameter for the same reason it is not read from the
 * clock in here — the answer changes with time even when nothing else does,
 * which is why the caller has to keep asking.
 *
 * Pure, and the whole of the rule: {@link StudyReadDirective} only supplies the
 * facts and re-asks.
 *
 * @param firstSeenAtMs When any part of the study first entered the viewport,
 *   or `null` if it never has.
 * @param hasReachedEnd Whether the end marker has come into view.
 * @param nowMs The current time, on the same clock as `firstSeenAtMs`.
 * @param minimumDwellMs The floor described on {@link MINIMUM_DWELL_MS}.
 * @returns `true` when the study counts as read.
 */
export function countsAsRead(
  firstSeenAtMs: number | null,
  hasReachedEnd: boolean,
  nowMs: number,
  minimumDwellMs: number
): boolean {
  if (firstSeenAtMs === null || !hasReachedEnd) {
    return false;
  }
  return nowMs - firstSeenAtMs >= minimumDwellMs;
}

/**
 * Reports a case study as read, once, when {@link countsAsRead} says so.
 *
 * Applied to each `<article class="study">` on `/work`. It watches two things:
 * the article itself, for when the reader arrived, and the `[data-study-end]`
 * marker after the last section, for when they reached the bottom. The marker
 * is explicit markup rather than `lastElementChild` because "the end" is a
 * claim about the content, and a structural guess would silently start meaning
 * something else the first time a section is appended.
 *
 * Nothing here is load-bearing for the page: if the observer never fires, or
 * the analytics script never loaded, the reader sees exactly the same article.
 */
@Directive({
  selector: '[appStudyRead]',
})
export class StudyReadDirective implements OnInit {
  /** The study's slug, sent as the event's only property. */
  public readonly appStudyRead = input.required<string>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly analytics = inject(AnalyticsService);

  private firstSeenAt: number | null = null;
  private hasReachedEnd = false;
  private reported = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  public ngOnInit(): void {
    const article = this.el.nativeElement;
    const end = article.querySelector('[data-study-end]');

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        if (entry.target === end) {
          this.hasReachedEnd = true;
        } else {
          this.firstSeenAt ??= Date.now();
        }
      }
      this.reportIfRead();
    });

    observer.observe(article);
    if (end) {
      observer.observe(end);
    }

    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
    });
  }

  /**
   * Ask the rule, and if the answer is "not yet, but it could be", ask again
   * when it could be.
   *
   * The re-ask is what makes dwell work at all. Intersection callbacks fire on
   * change, and a reader sitting still on a study generates none — so without a
   * timer the rule would only ever be evaluated at the moment the end came into
   * view, which is the one moment it is guaranteed to be too early.
   */
  private reportIfRead(): void {
    if (this.reported || this.firstSeenAt === null) {
      return;
    }

    if (countsAsRead(this.firstSeenAt, this.hasReachedEnd, Date.now(), MINIMUM_DWELL_MS)) {
      this.reported = true;
      this.analytics.track(ANALYTICS_EVENTS.caseStudyRead, { study: this.appStudyRead() });
      return;
    }

    if (this.hasReachedEnd && this.timer === null) {
      const remaining = this.firstSeenAt + MINIMUM_DWELL_MS - Date.now();
      this.timer = setTimeout(
        () => {
          this.timer = null;
          this.reportIfRead();
        },
        Math.max(remaining, 0)
      );
    }
  }
}
