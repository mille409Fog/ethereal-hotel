import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import {
  DESK_COPY,
  INVITATION,
  READER_CUE,
  SUNSET_CARD,
  describeCountdown,
  formatClockTime,
} from './desk';
import { FrameLoop, type IFrame } from './gl/loop';
import { forcedState, readTheSun, SUN_INTERVAL_MS } from './hour';
import { prefersReducedMotion } from './reduced-motion';
import type { LobbyRenderer } from './renderer';
import { rigFor } from './rooms/light-rig';
import type { IAubadeClock } from './solar';

/** Where the desk card stops counting hours and starts describing a season. */
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * `/aubade` — Floor 0, The Desk.
 *
 * The first room of a separate work. See `AUBADE.md`; the short version is that
 * this is a hotel that keeps the visitor's hours, rendered entirely by
 * raymarching signed distance fields, and this route is where the clock and the
 * room meet.
 *
 * ## What the hour does
 *
 * `solar/` answers one question — given the browser, what is the sun doing where
 * this person is — and returns one of five states. `rooms/light-rig.ts` turns
 * that into a palette and a light rig; `desk.ts` turns it into what the hotel
 * says. This component is the wiring, and it holds one signal that everything
 * else is derived from.
 *
 * Two decisions in that wiring are worth knowing.
 *
 * **The clock is re-read on a timer, not once.** A minute is far finer than the
 * states need — the narrowest of them lasts about half an hour at a temperate
 * latitude — but the piece's ending is a visitor sitting through their own
 * sunrise, and a page that read the sun at load and never again would show them
 * a hotel that failed to close. The interval is cheap: it is arithmetic, no
 * network, and it does not touch the GPU.
 *
 * **The invitation is a signal, not a route.** A visitor who arrives in daylight
 * can open the night rooms in one click — AUBADE requires that, in as many words,
 * because a hiring manager opening the link at 2pm on a Tuesday has to reach the
 * whole work. Taking it swaps the rig for `open` and leaves one mark: a line of
 * daylight under the door, which is the only thing in the render that says the
 * hour was not yours.
 *
 * ## Three constraints this component exists to satisfy
 *
 * **It must not cost the rest of the site anything.** AUBADE's second
 * non-negotiable is that `/` and `/dashboard` Lighthouse scores do not move by a
 * point. So: a lazy route, and `renderer.ts` behind a dynamic `import()` rather
 * than a static one. The static import here is `import type`, which the compiler
 * erases — the renderer, the shader sources and everything in `gl/` land in
 * their own chunk that is fetched when someone actually opens this route. No
 * WebGL context is created before then, because the code that could create one
 * has not been downloaded.
 *
 * **Reduced motion is honoured at the concept level.** Not a slower camera — no
 * camera. The loop is never started; one frame is drawn and left. AUBADE's third
 * non-negotiable is explicit that the piece becomes a series of still
 * compositions, and a still raymarched interior is a perfectly good picture,
 * which is the reason that instruction is followable at all. The one thing that
 * still repaints a held frame is the hour changing, because a room that kept
 * showing midnight through someone's sunrise would be a worse stillness than the
 * one they asked for.
 *
 * **It degrades in the open.** No WebGL2, or a driver that rejects the shader,
 * and the room is written out in prose instead. The quality ladder's current
 * rung is printed on the plate under the frame rather than applied quietly. Both
 * are AUBADE's fourth non-negotiable: silent degradation is how a portfolio
 * piece gets remembered as the one that ran badly on somebody's laptop.
 *
 * The prose in the second band is not the Reader's Edition and is not a summary
 * of it. It is this room at this hour — four paragraphs, one of which the sun
 * moves — and it is here because a page whose only content is a canvas is
 * unreadable, unsearchable, and gone the moment a driver says no. The Reader's
 * Edition is the whole hotel as a prose work, it lives at `/aubade/reader` where
 * no WebGL context is ever created, and both of this route's screens carry a
 * visible link to it because AUBADE's first non-negotiable requires one on every
 * screen. Keeping them separate is what stops either from being an apology for
 * the other.
 */
@Component({
  selector: 'app-aubade',
  templateUrl: './aubade.html',
  // `tokens.css` first: it declares the palette both AUBADE routes are drawn
  // in, so the lobby and the Reader's Edition cannot drift into two brasses.
  styleUrls: ['./tokens.css', './aubade.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Aubade implements AfterViewInit, OnDestroy {
  private readonly stage = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');

  /**
   * What the visitor is looking at.
   *
   * - `opening` — the renderer chunk is in flight. Lasts a few hundred
   *   milliseconds on a cold cache and nothing on a warm one.
   * - `running` — the room, breathing.
   * - `still` — the room, held. `prefers-reduced-motion`.
   * - `closed` — no WebGL2, or the driver would not take the shader. The prose.
   */
  public readonly mode = signal<'opening' | 'running' | 'still' | 'closed'>('opening');

  /** What the detail ladder has done, in the register's voice, or `null`. */
  public readonly note = signal<string | null>(null);

  /**
   * The sun, where this visitor is. Re-read on a timer; every other signal on
   * this component is derived from it.
   */
  public readonly clock = signal<IAubadeClock>(readTheSun());

  /** Whether the visitor opened the night rooms themselves. Never unset. */
  public readonly invited = signal(false);

  /** What the hotel is doing, after the dev-only `?t=` override has its say. */
  public readonly state = computed(() => this.forced ?? this.clock().state);

  /** The clerk's line, the picture's name, and the prose's first sentence. */
  public readonly copy = computed(() => DESK_COPY[this.state()]);

  /** The offer, the control, and what taking it leaves behind. */
  public readonly invitation = INVITATION;

  /** The link to the Reader's Edition, which both of this route's screens carry. */
  public readonly reader = READER_CUE;

  /** True while the hotel is shut and the visitor has not let themselves in. */
  public readonly offering = computed(() => this.state() === 'shuttered' && !this.invited());

  /**
   * True while the visitor is in the night rooms on their own recognisance.
   *
   * Goes false when the sun actually sets under them, because from that moment
   * the hour is theirs by right rather than by request — see `rigFor`, which
   * drops the mark on the same condition.
   */
  public readonly marked = computed(() => this.state() === 'shuttered' && this.invited());

  /**
   * The card on the desk: when the sun goes down here, and how long that is.
   *
   * `null` at every hour but the shuttered one. A countdown to sunset shown to
   * somebody standing in the dark is answering a question nobody asked.
   *
   * `today` is false above the Arctic Circle in summer, where the sun does not
   * go down at all and the next sunset is two months out. That is not the
   * ordinary card with a longer number in it: there is no time to print at the
   * top, and a visitor in Tromsø in June is owed the actual situation rather
   * than a countdown they would reasonably read as broken. The phrase itself is
   * the same one — see `describeCountdown` — the sentence around it changes.
   */
  public readonly sunsetCard = computed(() => {
    const clock = this.clock();
    if (this.state() !== 'shuttered') {
      return null;
    }

    const set = clock.nextSet;
    const today = set !== null && set.getTime() - clock.at.getTime() < MILLISECONDS_PER_DAY;
    const at = today && set !== null ? formatClockTime(set, clock.zone) : null;
    const countdown = describeCountdown(clock.at, set);

    return {
      today,
      heading: SUNSET_CARD.heading(at),
      body: today ? SUNSET_CARD.today(countdown) : SUNSET_CARD.season(countdown),
    };
  });

  private renderer: LobbyRenderer | null = null;
  private loop: FrameLoop | null = null;
  private observer: ResizeObserver | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  /** From the dev-only `?t=`; `null` in production and in the ordinary case. */
  private readonly forced = forcedState();

  /**
   * Set before anything is torn down, and read by the async setup below. The
   * component can be destroyed while the renderer chunk is still in flight, and
   * without this that resolves into a GPU context nobody will ever release.
   */
  private destroyed = false;

  public async ngAfterViewInit(): Promise<void> {
    const canvas = this.stage().nativeElement;

    // The dynamic import is the point — see the class comment. It also means
    // this method is the first place in the application where a WebGL context
    // can possibly exist.
    const { LobbyRenderer } = await import('./renderer');
    const renderer = LobbyRenderer.create(canvas);

    if (renderer === null) {
      this.mode.set('closed');
      return;
    }

    // Destroyed while the chunk was in flight. Rare, entirely possible on a slow
    // connection and a fast reader, and it leaks a GPU context every time.
    if (this.destroyed) {
      renderer.dispose();
      return;
    }

    this.renderer = renderer;
    this.loop = new FrameLoop((frame) => {
      this.draw(frame);
    });

    this.watchSize(canvas, renderer);
    this.watchContextLoss(canvas);
    this.watchTheSun();

    if (prefersReducedMotion()) {
      this.mode.set('still');
      this.loop.renderOnce();
      return;
    }

    this.mode.set('running');
    this.loop.start();
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.loop?.stop();
    this.observer?.disconnect();
    if (this.ticker !== null) {
      clearInterval(this.ticker);
    }
    this.renderer?.dispose();
    this.renderer = null;
  }

  /**
   * Open the night rooms.
   *
   * Deliberately one-way. AUBADE's invitation is a door a visitor lets
   * themselves through, and a door with a handle on both sides is a toggle — the
   * refusal stops being a position and becomes a preference.
   */
  public accept(): void {
    this.invited.set(true);
    // A held frame has to be redrawn: the visitor just asked for a different
    // room and a reduced-motion loop is not going to draw one on its own.
    if (!this.loop?.running) {
      this.loop?.renderOnce();
    }
  }

  /** One frame, plus whatever the renderer wants said about it. */
  private draw(frame: IFrame): void {
    const renderer = this.renderer;
    if (renderer === null) {
      return;
    }

    if (!renderer.render(frame, rigFor(this.state(), this.invited()))) {
      // A lost context, or a disposed renderer. Stop rather than spin: a loop
      // calling into a dead context burns a core for as long as the tab is open
      // and draws nothing at all.
      this.loop?.stop();
      return;
    }

    const tier = renderer.report.tier;
    if (tier.note !== this.note()) {
      this.note.set(tier.note);
    }
  }

  /**
   * Re-read the sun once a minute.
   *
   * The interval and the reading itself both live in `hour.ts`, which the
   * Reader's Edition shares — see that file for why the dev-only back door is
   * written in one place. What is local is the consequence: the redraw is
   * conditional on the state actually changing, so a running loop is untouched
   * sixty times an hour and a held one repaints five times a day.
   */
  private watchTheSun(): void {
    this.ticker = setInterval(() => {
      const before = this.state();
      this.clock.set(readTheSun());

      if (this.state() !== before && !this.loop?.running) {
        this.loop?.renderOnce();
      }
    }, SUN_INTERVAL_MS);
  }

  /**
   * Re-measure on resize, and only on resize.
   *
   * `ResizeObserver` rather than a `window` resize listener: this fires for a
   * sidebar opening, a zoom change and a device-pixel-ratio change on a monitor
   * swap, none of which resize the window. It is also why `render()` never
   * touches the DOM — see the renderer's file comment.
   */
  private watchSize(canvas: HTMLCanvasElement, renderer: LobbyRenderer): void {
    this.observer = new ResizeObserver(() => {
      renderer.measure();
      // A stopped loop still has to repaint, or a reduced-motion visitor who
      // resizes the window is left looking at a stretched still.
      if (!this.loop?.running) {
        this.loop?.renderOnce();
      }
    });
    this.observer.observe(canvas);
  }

  /**
   * A lost context is not an error and is not rare: it happens on a GPU driver
   * update, on a laptop switching graphics, and on a browser deciding some other
   * tab needs the memory more. Saying so is better than a black rectangle.
   */
  private watchContextLoss(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('webglcontextlost', (event) => {
      // Without this the context is never eligible for restoration; the default
      // action of the event is to make the loss permanent.
      event.preventDefault();
      this.loop?.stop();
      this.mode.set('closed');
    });
  }
}
