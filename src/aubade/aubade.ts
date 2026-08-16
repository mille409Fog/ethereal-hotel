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
import { breathAt, settleStep } from './cellar';
import {
  CELLAR_COPY,
  CORRIDOR_COPY,
  DESK_COPY,
  FLOOR_NAMES,
  FLOOR_PROSE,
  INVITATION,
  LIBRARY_COPY,
  LIFT_COPY,
  READER_CUE,
  RENDER_NOTES,
  STILLNESS_COPY,
  SUNSET_CARD,
  describeCountdown,
  formatClockTime,
} from './desk';
import {
  canCall,
  depthAt,
  depthForFloor,
  floorAfter,
  liftHasArrived,
  type Floor,
  type ILift,
  type LiftDirection,
} from './descent';
import { FrameLoop, type IFrame } from './gl/loop';
import { forcedState, readTheSun, SUN_INTERVAL_MS } from './hour';
import { prefersReducedMotion } from './reduced-motion';
import type { HotelRenderer } from './renderer';
import { cellarRigFor } from './rooms/cellar-rig';
import { corridorRigFor } from './rooms/corridor-rig';
import { libraryRigFor } from './rooms/library-rig';
import { rigFor } from './rooms/light-rig';
import type { IAubadeClock } from './solar';
import type { AubadeState } from './solar/state';

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

  /** What the render itself is doing, when that is worth saying. */
  public readonly modeNote = computed<string | null>(() => RENDER_NOTES[this.mode()]);

  /**
   * Everything the machinery has to say about itself, in order, with the silences
   * removed.
   *
   * The two above, as one list. They are the same voice at the same size in the
   * same place and are never ordered differently, so the template renders them
   * with one `@for` rather than two `@if`s — which is not only tidiness: the
   * template's cyclomatic-complexity limit is a real budget, and the Cellar's
   * instruction is the block that needed the room.
   */
  public readonly remarks = computed<readonly string[]>(() =>
    [this.modeNote(), this.note()].filter((line): line is string => line !== null)
  );

  /**
   * The sun, where this visitor is. Re-read on a timer; every other signal on
   * this component is derived from it.
   */
  public readonly clock = signal<IAubadeClock>(readTheSun());

  /** Whether the visitor opened the night rooms themselves. Never unset. */
  public readonly invited = signal(false);

  /** What the hotel is doing, after the dev-only `?t=` override has its say. */
  public readonly state = computed(() => this.forced ?? this.clock().state);

  /**
   * Which floor the visitor is standing on. Only changes when the lift arrives —
   * during the ride this is still the floor they left, because the floor is where
   * somebody *is* and for seven and a half seconds they are not anywhere.
   */
  public readonly floor = signal<Floor>(0);

  /** True while the car is moving. The control is replaced by a line for the duration. */
  public readonly riding = signal(false);

  /**
   * The clerk's line, the picture's name, and the prose's first sentence, for the
   * floor the visitor is on.
   *
   * One lookup rather than a branch in the template, and it is the same shape on
   * both floors so nothing downstream has to know which one it got.
   */
  public readonly copy = computed(() => {
    const floor = this.floor();
    const state = this.state();
    if (floor === -3) {
      return CELLAR_COPY[state];
    }
    if (floor === -2) {
      return LIBRARY_COPY[state];
    }
    return floor === -1 ? CORRIDOR_COPY[state] : DESK_COPY[state];
  });

  /**
   * How far into the cellar the visitor has got, in three steps rather than in the
   * hundredths the shader is given.
   *
   * Coarse on purpose. The underlying number moves every frame, and a signal that
   * changed sixty times a second would schedule change detection sixty times a
   * second to rewrite a sentence that is the same sentence — which is the exact
   * mistake `car` is a plain field to avoid. Three buckets change perhaps four
   * times in a visit.
   *
   * `null` anywhere but Floor −3: no other room asks the visitor for anything.
   */
  public readonly stillnessNote = signal<string | null>(null);

  /** What the plate over the room calls this floor. */
  public readonly floorName = computed(() => FLOOR_NAMES[this.floor()]);

  /** The rest of the room in words — everything the sun does not move. */
  public readonly prose = computed(() => FLOOR_PROSE[this.floor()]);

  /** The lift's labels. */
  public readonly lift = LIFT_COPY;

  /**
   * Whether the lift can be called right now.
   *
   * Shut while the hotel is shut and the visitor has not let themselves in, which
   * is the one thing the invitation actually gates. AUBADE requires the invitation
   * to be obvious and to reach the whole work in one click; it does not require the
   * refusal to be free, and a door that costs nothing to be turned away from is set
   * dressing rather than a position.
   */
  public readonly liftAvailable = computed(
    () =>
      !this.riding() &&
      this.mode() !== 'closed' &&
      !(this.state() === 'shuttered' && !this.invited())
  );

  /**
   * The lift's controls: one per direction the shaft actually goes from here.
   *
   * Empty when there is no render to move between — a browser without WebGL2 gets
   * the prose for every floor and no lift, because a control that changes a picture
   * nobody can see is worse than no control.
   *
   * A list rather than the single button this was, because the middle floor is the
   * first one with somewhere to go in both directions and a lift with one button on
   * a middle floor is a lift that has decided for you. The ends of the shaft still
   * show one control each, and they show it because `canCall` says so rather than
   * because the template knows which floors those are.
   *
   * Buttons stay mounted and go disabled rather than being swapped for a line of
   * text, and that is a decision about behaviour before it is one about template
   * complexity. Swapping the element out mid-ride reflows the plate under whatever
   * the visitor is pointing at, and a screen reader gets a removal and an insertion
   * where what actually happened is that one control became unavailable. Disabling
   * it says that, and says it in the building's own voice.
   */
  public readonly liftControls = computed<
    ReadonlyArray<{ direction: LiftDirection; text: string; enabled: boolean }>
  >(() => {
    if (this.mode() === 'closed') {
      return [];
    }

    const floor = this.floor();
    const riding = this.riding();
    const shut = this.state() === 'shuttered' && !this.invited();

    return (['up', 'down'] as const)
      .filter((direction) => canCall(floor, direction))
      .map((direction) => {
        if (riding) {
          return { direction, text: LIFT_COPY.moving, enabled: false };
        }
        if (shut) {
          return { direction, text: LIFT_COPY.shut, enabled: false };
        }
        return {
          direction,
          text: direction === 'up' ? LIFT_COPY.up : LIFT_COPY.down,
          enabled: true,
        };
      });
  });

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

  private renderer: HotelRenderer | null = null;
  private loop: FrameLoop | null = null;
  private observer: ResizeObserver | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  /**
   * The ride in progress, or `null` at rest.
   *
   * Not a signal. It is read once a frame by `draw` and written twice a ride, and
   * a signal here would schedule change detection sixty times a second for a value
   * no template reads — the template reads `riding`, which changes twice.
   */
  private car: ILift | null = null;

  /**
   * How still the visitor has been, in [0, 1] — Floor −3's whole subject.
   *
   * Not a signal, for the reason `car` is not one and more so: it is written every
   * frame and read every frame by exactly one caller. The template reads
   * `stillnessNote`, which changes about four times in a visit.
   */
  private stillness = 0;

  /**
   * The room's clock the last time the visitor did anything, or `null` if they
   * never have.
   *
   * A timestamp rather than a per-frame flag, because the events that set it arrive
   * on their own schedule and frames arrive on theirs: a pointer that moves once
   * between two frames would otherwise be seen by whichever frame happened to
   * follow it and by no other, and a pointer moving steadily at 120Hz would be seen
   * by every frame. The grace window below makes both of those cost the same.
   */
  private disturbedAtSeconds: number | null = null;

  /**
   * How long after a movement the visitor still counts as moving, in seconds of the
   * room's clock.
   *
   * A third of a second. Long enough that one flick of a pointer is charged as a
   * movement rather than as a single frame's worth of one — about two and a half
   * seconds of lost ground, which is felt and forgiven — and short enough that
   * somebody who stops is credited with stopping almost immediately.
   */
  private static readonly DISTURBANCE_GRACE_SECONDS = 1 / 3;

  /** Torn down in `ngOnDestroy`; there are four of them and they are all on `window`. */
  private stirring: (() => void) | null = null;

  /**
   * The room's clock at the last frame drawn.
   *
   * The lift is timed in simulated seconds rather than wall-clock ones, so calling
   * it needs to know what time it is *in the room*. Tracked here rather than
   * exposed by `FrameLoop`, because this is the only caller that has ever wanted
   * it and a getter on the loop would imply the loop's clock were public API.
   */
  private lastSeconds = 0;

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
    const { HotelRenderer } = await import('./renderer');
    const renderer = HotelRenderer.create(canvas);

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
      // The Cellar, handed over rather than asked for.
      //
      // Floor −3's content is ninety seconds of change, and under reduced motion
      // there is no loop to change anything: one frame is drawn and left. A visitor
      // who asked for less motion would get a black rectangle for ever, which is
      // the worst outcome available on any floor of this hotel.
      //
      // AUBADE's third non-negotiable says reduced motion becomes "a series of
      // still compositions that change on interaction", so the still composition
      // for this floor is the resolved room. They are given the reward instead of
      // the wait — which is the only reading of that instruction that leaves them
      // anything, and it is what the prose down there tells them has happened.
      this.stillness = 1;
      this.loop.renderOnce();
      return;
    }

    this.watchTheVisitor();
    this.mode.set('running');
    this.loop.start();
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.loop?.stop();
    this.observer?.disconnect();
    this.stirring?.();
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

  /**
   * Call the lift.
   *
   * Two paths, and the second one is not a degradation. With the loop running the
   * descent is the morph AUBADE asks for: seven and a half seconds of two distance
   * fields mixing in full view. Under `prefers-reduced-motion` the loop is not
   * running at all, and the piece's third non-negotiable is explicit that the
   * answer there is not a slower animation but a series of still compositions that
   * change on interaction — which is exactly what a cut between two floors is. So
   * a reduced-motion visitor gets both rooms and no ride, rather than a ride they
   * asked not to be given.
   */
  public call(direction: LiftDirection): void {
    const from = this.floor();
    if (!this.liftAvailable() || !canCall(from, direction)) {
      return;
    }

    if (this.loop?.running !== true) {
      this.floor.set(floorAfter(from, direction));
      this.loop?.renderOnce();
      return;
    }

    // Leaving the floor gives the cellar back. Stillness is what somebody has done
    // *in that room*, so it cannot be carried down in the lift — a visitor who spent
    // ninety seconds reading the prose in the lobby has been perfectly still and has
    // not been standing in a cellar, and arriving already adapted would be the floor
    // handing over its own subject at the door.
    //
    // **Below the reduced-motion return on purpose.** That path has no loop, so a
    // stillness reset there could never be integrated back up: the visitor would
    // arrive on Floor −3 at zero and stay there, looking at an unresolved room with
    // no way to resolve it, for ever. They are handed the settled room instead — see
    // `ngAfterViewInit` — and this line must not take it away again on the way down.
    this.stillness = 0;
    this.disturbedAtSeconds = null;

    this.car = { from, direction, startedAtSeconds: this.lastSeconds };
    this.riding.set(true);
  }

  /** One frame, plus whatever the renderer wants said about it. */
  private draw(frame: IFrame): void {
    const renderer = this.renderer;
    if (renderer === null) {
      return;
    }

    const elapsed = frame.simulatedSeconds - this.lastSeconds;
    this.lastSeconds = frame.simulatedSeconds;

    const state = this.state();
    const invited = this.invited();
    this.keepStill(frame.simulatedSeconds, elapsed, state, invited);

    if (
      !renderer.render(frame, {
        lobby: rigFor(state, invited),
        corridor: corridorRigFor(state, invited),
        library: libraryRigFor(state, invited),
        cellar: cellarRigFor(state, invited),
        depth: this.depthNow(frame.simulatedSeconds),
        stillness: this.stillness,
        breath: breathAt(frame.simulatedSeconds),
      })
    ) {
      // A lost context, or a disposed renderer. Stop rather than spin: a loop
      // calling into a dead context burns a core for as long as the tab is open
      // and draws nothing at all.
      this.loop?.stop();
      return;
    }

    this.settle(frame.simulatedSeconds);

    const tier = renderer.report.tier;
    if (tier.note !== this.note()) {
      this.note.set(tier.note);
    }
  }

  /**
   * Where the lift is, this frame.
   *
   * @param seconds The room's clock.
   * @returns `uDepth` — the settled floor's exact depth at rest, and the eased
   *   progress of the ride while the car is moving.
   */
  private depthNow(seconds: number): number {
    const car = this.car;
    if (car === null) {
      return depthForFloor(this.floor());
    }
    return depthAt(seconds - car.startedAtSeconds, car.from, car.direction);
  }

  /**
   * Retire a finished ride and put the visitor on a floor.
   *
   * Checked after the draw rather than before it, so the last frame of the descent
   * is rendered as part of the descent. Doing it first lands the visitor on the new
   * floor one frame early, which is invisible on the render — `depthAt` and
   * `depthForFloor` agree exactly at the endpoint, which `descent.spec.ts` asserts
   * — and wrong on the plate, which would change while the room was still moving.
   */
  private settle(seconds: number): void {
    const car = this.car;
    if (car === null || !liftHasArrived(seconds - car.startedAtSeconds)) {
      return;
    }

    this.car = null;
    this.floor.set(floorAfter(car.from, car.direction));
    this.riding.set(false);
  }

  /**
   * Advance the stillness, and say so on the plate when it has moved far enough to
   * be worth a different sentence.
   *
   * Only on Floor −3, and only once the lift has stopped. Stillness accrues in the
   * room rather than in the building — see `call`, which gives it back — and a
   * visitor mid-ride is not standing anywhere.
   *
   * @param seconds The room's clock.
   * @param elapsed Simulated seconds since the previous frame.
   * @param state What the hotel is doing.
   * @param invited Whether the visitor let themselves in.
   */
  private keepStill(seconds: number, elapsed: number, state: AubadeState, invited: boolean): void {
    if (this.floor() !== -3 || this.riding()) {
      if (this.stillnessNote() !== null) {
        this.stillnessNote.set(null);
      }
      return;
    }

    const since = this.disturbedAtSeconds;
    const disturbed = since !== null && seconds - since < Aubade.DISTURBANCE_GRACE_SECONDS;
    this.stillness = settleStep(this.stillness, elapsed, disturbed);

    // What the plate says is about how far in they have got *and* about how far in
    // they can get, which are different numbers — the second is the hour's ceiling.
    // A visitor at noon who has been perfectly still for two minutes has a stillness
    // of 1 and a room of nothing, and telling them to keep still would be a lie told
    // to somebody being patient.
    const ceiling = cellarRigFor(state, invited).adaptation;
    let line: string;
    if (ceiling <= 0) {
      line = STILLNESS_COPY.daylit;
    } else if (this.stillness >= 1) {
      line = STILLNESS_COPY.settled;
    } else if (this.stillness > 0.12) {
      line = STILLNESS_COPY.arriving;
    } else {
      line = STILLNESS_COPY.waiting;
    }

    if (line !== this.stillnessNote()) {
      this.stillnessNote.set(line);
    }
  }

  /**
   * Notice the visitor moving.
   *
   * Four events on `window` rather than on the canvas, because the demand is that
   * the *person* is still, and a hand that scrolls the prose or tabs through the
   * lift controls has not been still merely because the pointer stayed off the
   * picture.
   *
   * Passive listeners: none of these is cancelled, and a non-passive `wheel` or
   * `touchmove` handler makes the browser wait for it before scrolling — which is a
   * measurable scroll jank charged to a page whose whole subject is calm.
   *
   * Not registered at all under `prefers-reduced-motion`: there is no loop to read
   * them, the cellar is handed over resolved, and a listener whose only effect would
   * be to take that away is worse than no listener.
   */
  private watchTheVisitor(): void {
    const stirred = (): void => {
      this.disturbedAtSeconds = this.lastSeconds;
    };

    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;
    for (const name of events) {
      window.addEventListener(name, stirred, { passive: true });
    }

    this.stirring = (): void => {
      for (const name of events) {
        window.removeEventListener(name, stirred);
      }
    };
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
  private watchSize(canvas: HTMLCanvasElement, renderer: HotelRenderer): void {
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
