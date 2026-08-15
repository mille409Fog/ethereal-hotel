import { ChangeDetectionStrategy, Component, computed, OnDestroy, signal } from '@angular/core';
import { readTheSun, SUN_INTERVAL_MS } from '../hour';
import type { IAubadeClock } from '../solar';
import {
  EDITION,
  EDITION_RETURN,
  EDITION_STANDFIRST,
  EDITION_TITLE,
  STANDING_HEADING,
} from './edition';
import { describeStanding } from './standing';

/**
 * `/aubade/reader` — the Reader's Edition.
 *
 * AUBADE's first non-negotiable, and the phase that had to land before any more
 * rooms were built: the hotel as a prose work, reachable from a visible link on
 * every screen, serving screen readers, `prefers-reduced-motion`, absent WebGL,
 * dying batteries, and people who would simply rather read. Doing it early
 * rather than last is the whole difference between an accessible work and a
 * bolted-on apology.
 *
 * ## What this component is, and mostly is not
 *
 * It is a renderer for `edition.ts` and a subscription to the sun. That is all,
 * and the restraint is the design: the writing lives in one file where it can be
 * read end to end, the computed sentences live in another where they can be
 * tested against real readings, and what is left here is a `@for` and a ticker.
 *
 * **No WebGL, by construction rather than by intention.** The phase's Definition
 * of Done is that no context is created on this route *at all*, and the way that
 * is guaranteed is that nothing reachable from this file can create one. It
 * imports `../hour` and `./edition` and `./standing`; none of those touches
 * `gl/`, `rooms/` or `renderer.ts`, so there is no code path — dynamic import,
 * lazy branch or otherwise — that could reach a canvas. `check:docs` gates the
 * import graph and an e2e test counts `getContext` calls on the live page,
 * because the two failure modes are different: one is a refactor, the other is
 * a browser doing something nobody wrote down.
 *
 * **The sun is re-read, on the same interval as the lobby.** A reader takes
 * five or six minutes over twelve hundred words, and the states are narrow
 * enough that one can change underneath them — a page that stated astronomical
 * night at the top and was still saying it after the sun came up would be making
 * exactly the claim this project exists to avoid making. See `../hour.ts`; the
 * dev-only back door is gated there, once, for both routes.
 *
 * **The standing is not an `aria-live` region.** It changes at most five times
 * while somebody is reading, and interrupting a reader mid-sentence to announce
 * that the sun has moved two degrees would be hostile. The page states the hour
 * it was read at; that is honest, and it is quiet.
 */
@Component({
  selector: 'app-aubade-reader',
  templateUrl: './reader.html',
  // `tokens.css` first, shared with the lobby — see that file. Nothing else in
  // this component's graph reaches `gl/`, and that is the Definition of Done.
  styleUrls: ['../tokens.css', './reader.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AubadeReader implements OnDestroy {
  /** The work. Fixed prose; nothing here depends on the hour. */
  public readonly edition = EDITION;

  /** The name of the hotel. */
  public readonly title = EDITION_TITLE;

  /** What this edition is, said once, before anything else. */
  public readonly standfirst = EDITION_STANDFIRST;

  /** The heading over the computed part. */
  public readonly standingHeading = STANDING_HEADING;

  /** The way back into the lobby, for a reader who wants it lit. */
  public readonly back = EDITION_RETURN;

  /**
   * The sun, where this reader is. Re-read on a timer.
   *
   * Deliberately not honouring `?t=<state>`: that back door forces a state
   * without moving the sun, which is what you want when inspecting five light
   * rigs and precisely what must not happen on the one page whose job is to
   * state the truth in words. `?t=<instant>` and `?tz=` still work, because
   * they move the sun for real and leave every sentence consistent.
   */
  public readonly clock = signal<IAubadeClock>(readTheSun());

  /** Where, what, and what happens next — the only part the sun moves. */
  public readonly standing = computed(() => describeStanding(this.clock()));

  private readonly ticker = setInterval(() => {
    this.clock.set(readTheSun());
  }, SUN_INTERVAL_MS);

  public ngOnDestroy(): void {
    clearInterval(this.ticker);
  }
}
