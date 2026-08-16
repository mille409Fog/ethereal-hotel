import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Aubade } from './aubade';
import { FLOORS } from './descent';
import { StubWebGL2 } from './gl/webgl.testing';
import type { AubadeState } from './solar/state';

/**
 * Small numbers as the prose writes them, for the one assertion that has to read
 * a sentence rather than a count. Only ever indexed with a floor count and its
 * complement out of six, so it stops where the building does.
 */
const SPELLED = ['no', 'one', 'two', 'three', 'four', 'five', 'six'] as const;

/**
 * `/aubade` — the route, not the room.
 *
 * Three of the four states this component can be in are failure states in the
 * sense that no pixels get drawn, and all three are supposed to be good
 * experiences rather than apologies. That is what most of this file is about:
 * that a browser without WebGL2 still gets the work, that
 * `prefers-reduced-motion` gets a still composition rather than a slow one, and
 * that a lost context says so instead of leaving a black rectangle.
 *
 * The fourth state — the loop actually running — is deliberately tested here
 * only up to the point of starting. `requestAnimationFrame` is stubbed out so no
 * frame ever fires: what happens inside a frame belongs to `gl/loop.spec.ts` and
 * `renderer.spec.ts`, and a component test that waits on real animation frames
 * is a component test that fails on a loaded CI box once a fortnight.
 *
 * ## Every test here pins the hour
 *
 * The component reads the real sun at the real moment, which would make this
 * file's results depend on what time of day CI happened to run — green all night
 * and red over lunch, or the reverse, with nothing in the diff to explain it. So
 * `setHour` drives the same dev-only `?t=` back door the Definition of Done
 * calls for, and the default is astronomical night so that the majority of these
 * tests, which are about WebGL and not about the sun, have one fixed hour to be
 * about.
 */

describe('the aubade route', () => {
  let fixture: ComponentFixture<Aubade>;
  let gl: StubWebGL2 | null;

  /**
   * Put the visitor at a given hour of the sun.
   *
   * Through the URL rather than through a spy, because that is the mechanism
   * that ships and the one the phase's Definition of Done names. Must be called
   * before the component is created: the state is read in a field initialiser.
   */
  const setHour = (state: AubadeState): void => {
    window.history.replaceState({}, '', `/aubade?t=${state}`);
  };

  /** Pretend the browser has, or has not, WebGL2. */
  const setWebGL2 = (available: boolean): void => {
    gl = available ? new StubWebGL2() : null;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => (gl === null ? null : gl.asContext()) as ReturnType<HTMLCanvasElement['getContext']>
    );
  };

  /**
   * Pretend the visitor has, or has not, asked for reduced motion.
   *
   * Assigned rather than spied on: jsdom does not implement `matchMedia`, so
   * there is no function for `vi.spyOn` to wrap. That absence is why
   * `prefersReducedMotion` calls it optionally.
   */
  const setReducedMotion = (reduce: boolean): void => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
      }),
    });
  };

  /**
   * Wait for the renderer's dynamic import to land.
   *
   * `whenStable` is not enough: a bare `import()` is not tracked by Angular, so
   * the component is stable while the chunk is still in flight. Polling the
   * component's own state is both honest about what is being waited for and
   * bounded, so a broken import fails the test rather than hanging it.
   */
  const settle = async (): Promise<void> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (fixture.componentInstance.mode() !== 'opening') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    fixture.detectChanges();
  };

  /** Mount, and let the renderer's dynamic import resolve. */
  const render = async (): Promise<void> => {
    fixture = TestBed.createComponent(Aubade);
    fixture.detectChanges();
    await settle();
  };

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const canvas = (): HTMLCanvasElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector('canvas');
  // The invitation's control specifically. There are two buttons on the plate
  // now — this one and the lift — and a bare `querySelector('button')` quietly
  // started matching whichever came first in the DOM.
  const button = (): HTMLButtonElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector('.lobby__invite');

  beforeEach(async () => {
    // No frames ever fire; see the file comment.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    setReducedMotion(false);
    setWebGL2(true);
    setHour('open');

    await TestBed.configureTestingModule({ imports: [Aubade] }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('whatever happens', () => {
    it('owns a main landmark, because it is the whole route', () => {
      // Matches /dashboard, /booking and /work. Without it the page is content
      // outside any landmark and a screen reader user cannot jump to it.
      fixture = TestBed.createComponent(Aubade);
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('main')).not.toBeNull();
    });

    it('names the hotel and the floor', async () => {
      await render();

      expect(text()).toContain('Hôtel');
      expect(text()).toContain('Aubade');
      expect(text()).toContain('The Desk');
    });

    it('writes the room out in prose, always', async () => {
      // Not an alt attribute and not `aria-hidden`: this is the work in its
      // other form, and it is on the page for a sighted visitor with a
      // throttled GPU as much as for a screen reader.
      await render();

      expect(text()).toContain('transom');
      expect(text()).toContain('brass bell');
    });

    it('says how far into the hotel this is', async () => {
      // Derived from the shaft rather than written out, for the same reason the
      // Reader's Edition's version of this claim is — see `edition.spec.ts`. A
      // literal here is a sentence somebody has to remember to edit in the commit
      // that ships a floor, and forgetting it is invisible: the page still reads
      // perfectly and is quietly advertising fewer rooms than the lift serves.
      await render();

      // Case-insensitive on the first, because it opens the sentence and the
      // sentence is prose rather than a data binding.
      expect(text()).toMatch(new RegExp(`${SPELLED[FLOORS.length]} floors of six`, 'i'));
      expect(text()).toContain(`The other ${SPELLED[6 - FLOORS.length]} are written and not built`);
    });
  });

  describe('the lift', () => {
    /**
     * The lift's own control, which is not the invitation's.
     *
     * Both are brass buttons on the same plate a line apart, which is exactly why
     * they are told apart by class here rather than by order or by label.
     */
    const lift = (): HTMLButtonElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('.lobby__call');

    /**
     * Every animation-frame callback outstanding, captured rather than fired.
     *
     * The file's default stub swallows frames entirely, which is right for every
     * other test here — but the descent is the one thing in this component that
     * only advances inside a frame, so these tests need to be able to hand the
     * loop a clock. Driven by hand, never by a real `requestAnimationFrame`, so
     * nothing here waits on a vsync.
     *
     * A queue rather than a single slot, and that is not defensive. Angular's own
     * change-detection scheduler also calls `requestAnimationFrame`, so it and
     * `FrameLoop` are both in flight at once and whichever asks second overwrites
     * the first. Holding one callback silently dropped the loop's tick and fired
     * Angular's scheduler in its place — the frames all appeared to run, the ride
     * never advanced by a millisecond, and the component looked broken rather
     * than the test.
     */
    let pendingFrames: Array<(timestampMs: number) => void> = [];

    /** Swap the swallowing stub for a capturing one. Call before `render()`. */
    const captureFrames = (): void => {
      pendingFrames = [];
      vi.stubGlobal('requestAnimationFrame', (callback: (timestampMs: number) => void) => {
        pendingFrames.push(callback);
        return pendingFrames.length;
      });
    };

    /**
     * Run the loop far enough for a ride to finish.
     *
     * Each frame is charged at most `MAX_FRAME_MS` of simulated time — the
     * accumulator's clamp, which exists so a backgrounded tab does not teleport
     * the room — so seven and a half seconds of lift cannot be jumped in one frame
     * however large a timestamp is handed over. Forty frames of a quarter second
     * is comfortably past the end and still instant.
     */
    const rideOut = (frames = 40): void => {
      for (let index = 1; index <= frames; index += 1) {
        const due = pendingFrames;
        pendingFrames = [];
        for (const callback of due) {
          callback(index * 250);
        }
      }
      fixture.detectChanges();
    };

    it('is offered at the desk when the hotel is open', async () => {
      await render();

      expect(lift()).not.toBeNull();
      expect(lift()?.disabled).toBe(false);
      expect(lift()?.textContent).toContain('down');
    });

    it('does not run while the hotel is shut and nobody has been invited', async () => {
      // The one thing the invitation actually gates. A refusal that costs the
      // visitor nothing is set dressing rather than a position.
      setHour('shuttered');
      await render();

      expect(lift()?.disabled).toBe(true);
      expect(text()).toContain('does not run while the hotel is shut');
    });

    it('starts running once the visitor lets themselves in', async () => {
      setHour('shuttered');
      await render();

      button()?.click();
      fixture.detectChanges();

      expect(lift()?.disabled).toBe(false);
    });

    it('is not offered at all when the browser cannot draw either room', async () => {
      // A control that changes a picture nobody can see is worse than no control.
      setWebGL2(false);
      await render();

      expect(lift()).toBeNull();
    });

    describe('the ride', () => {
      it('will not be hurried, and says so', async () => {
        captureFrames();
        await render();

        lift()?.click();
        fixture.detectChanges();

        expect(fixture.componentInstance.riding()).toBe(true);
        expect(lift()?.disabled).toBe(true);
        expect(text()).toContain('will not be hurried');
      });

      it('leaves the visitor on the floor they departed until it arrives', async () => {
        // The floor is where somebody *is*, and for seven and a half seconds they
        // are not anywhere. A plate that changed on departure would name a room
        // the render has not reached.
        captureFrames();
        await render();

        lift()?.click();
        rideOut(4);

        expect(fixture.componentInstance.floor()).toBe(0);
        expect(fixture.componentInstance.riding()).toBe(true);
      });

      it('arrives at the corridor and gives the control back', async () => {
        captureFrames();
        await render();

        lift()?.click();
        rideOut();

        expect(fixture.componentInstance.floor()).toBe(-1);
        expect(fixture.componentInstance.riding()).toBe(false);
        expect(lift()?.disabled).toBe(false);
      });

      it('offers the way back up once it is there', async () => {
        captureFrames();
        await render();

        lift()?.click();
        rideOut();
        expect(lift()?.textContent).toContain('up');

        lift()?.click();
        rideOut();
        expect(fixture.componentInstance.floor()).toBe(0);
      });

      it('ignores a second call while the car is moving', async () => {
        captureFrames();
        await render();

        lift()?.click();
        rideOut(4);
        // The control is disabled, so this is the belt to the template's braces —
        // and the one that would still hold if the disabled attribute were lost.
        fixture.componentInstance.call('down');
        rideOut();

        expect(fixture.componentInstance.floor()).toBe(-1);
      });
    });

    describe('on the floor below', () => {
      /**
       * Take the lift without a ride.
       *
       * Under `prefers-reduced-motion` the loop never starts, so the descent is a
       * cut between two still compositions rather than a morph — AUBADE's third
       * non-negotiable asks for exactly that, and it is also the shortest way to
       * put these tests in the corridor.
       */
      const goDown = async (): Promise<void> => {
        setReducedMotion(true);
        await render();
        fixture.componentInstance.call('down');
        fixture.detectChanges();
      };

      it('cuts straight there when the visitor asked for less motion', async () => {
        await goDown();

        expect(fixture.componentInstance.mode()).toBe('still');
        expect(fixture.componentInstance.floor()).toBe(-1);
      });

      it('renames the floor on the plate', async () => {
        await goDown();

        expect(text()).toContain('The Mirror Corridor');
        expect(text()).not.toContain('The Desk');
      });

      it('says what the corridor is doing at this hour, not what the lobby is', async () => {
        await goDown();

        expect(text()).toContain('full gas');
        expect(text()).not.toContain('nobody at the desk');
      });

      it('writes the corridor out in prose', async () => {
        await goDown();

        expect(text()).toContain('mirror');
        expect(text()).toContain('runner');
        expect(text()).not.toContain('brass bell');
      });

      it('never tells the visitor what is missing from the mirror', async () => {
        // The phase's Definition of Done is that a stranger notices the absent
        // reflection unprompted and within ten seconds. Prose that names it has
        // answered the question for them, and there is then nothing to notice.
        await goDown();

        const prose = text().toLowerCase();
        expect(prose).not.toContain('reflect');
        expect(prose).not.toContain('does not appear');
      });

      it('still carries the link to the Reader’s Edition', async () => {
        // AUBADE's first non-negotiable asks for it on every screen, and the
        // corridor is two more of them.
        await goDown();

        const links = (fixture.nativeElement as HTMLElement).querySelectorAll(
          'a[href="/aubade/reader"]'
        );
        expect(links.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('at the bottom of the shaft', () => {
      /**
       * Three floors down, without three rides.
       *
       * Under `prefers-reduced-motion` the loop never starts and each call is a cut
       * between two still compositions — AUBADE's third non-negotiable asks for
       * exactly that, and it is also the only way to reach Floor −3 in a test
       * without driving twenty-two and a half seconds of simulated lift.
       */
      const goToTheBottom = async (state: AubadeState = 'open'): Promise<void> => {
        setHour(state);
        setReducedMotion(true);
        await render();
        for (let step = 0; step < 3; step += 1) {
          fixture.componentInstance.call('down');
        }
        fixture.detectChanges();
      };

      it('reaches the cellar and stops there', async () => {
        await goToTheBottom();

        expect(fixture.componentInstance.floor()).toBe(-3);
        expect(text()).toContain('The Cellar');

        // The shaft ends. A fourth call is a lift asked to go through the bottom of
        // the building, and `canCall` is what stops it.
        fixture.componentInstance.call('down');
        fixture.detectChanges();
        expect(fixture.componentInstance.floor()).toBe(-3);
      });

      it('offers only the way back up', async () => {
        await goToTheBottom();

        const controls = (fixture.nativeElement as HTMLElement).querySelectorAll('.lobby__call');
        expect(controls.length).toBe(1);
        expect(controls[0].textContent).toContain('up');
      });

      it('writes the room out in prose, and asks for something', async () => {
        await goToTheBottom();

        expect(text()).toContain('barrel vault');
        expect(text()).toContain('casks');
        expect(text()).toContain('stand still');
        expect(text()).not.toContain('brass bell');
      });

      it('never explains why standing still works', async () => {
        // The corridor's rule, inherited. The plate says what to do, because a
        // room whose content is ninety seconds away has to; it does not say that
        // the room is unchanged and the change is in the visitor's own eyes. That
        // is the thing this floor is for, and it is left where it can be found.
        await goToTheBottom();

        const prose = text().toLowerCase();
        expect(prose).not.toContain('your eyes');
        expect(prose).not.toContain('adapt');
      });

      it('hands the room over resolved when the visitor asked for less motion', async () => {
        // There is no loop under `prefers-reduced-motion`: one frame is drawn and
        // left. A floor whose entire content is ninety seconds of change would be a
        // black rectangle for ever, which is the worst outcome available anywhere in
        // this hotel — so the reward is given instead of the wait.
        await goToTheBottom();

        expect(gl?.uniformValue('uStillness')).toEqual([1]);
      });

      it('says nothing about standing still until the visitor is down there', async () => {
        // The one instruction in the piece, and it belongs to one floor. On any
        // other it would be an instruction about nothing.
        setReducedMotion(true);
        await render();
        expect(fixture.componentInstance.stillnessNote()).toBeNull();
      });

      it('tells a daytime visitor that standing still will not help them', async () => {
        // The ceiling is exactly zero at noon, so "keep still" would be a lie told
        // to somebody being patient. The lift only runs down there because the
        // invitation opened it — which is also why the rig is the open one and the
        // plate still is not.
        setHour('shuttered');
        setReducedMotion(true);
        await render();

        fixture.componentInstance.accept();
        for (let step = 0; step < 3; step += 1) {
          fixture.componentInstance.call('down');
        }
        fixture.detectChanges();

        expect(fixture.componentInstance.floor()).toBe(-3);
        expect(text()).toContain('came in out of the daylight');
      });
    });
  });

  describe('what the sun is doing', () => {
    it('says so, in the desk clerk’s voice', async () => {
      await render();
      expect(text()).toContain('Astronomical night');
    });

    it('says something different at a different hour', async () => {
      // The whole phase in one assertion: the room and the words are both
      // functions of the same solar state, so they cannot disagree.
      setHour('shuttered');
      await render();

      expect(text()).toContain('The hotel is shut');
      expect(text()).not.toContain('Astronomical night');
    });

    it('names the picture for the hour it is actually drawing', async () => {
      // An alt text describing moonlight to somebody looking at a shuttered room
      // is worse than none.
      setHour('shuttered');
      await render();

      expect(canvas()?.getAttribute('aria-label') ?? '').toContain('shutter');
    });

    it('opens the room out in prose for the hour too', async () => {
      setHour('aubade');
      await render();

      expect(text()).toContain('The last of the dark');
    });

    it('ignores a query parameter it does not understand', async () => {
      // A mistyped URL shows the real hour rather than an error page. Which hour
      // that is depends on when this runs, so what is asserted is that a plate
      // line exists at all.
      window.history.replaceState({}, '', '/aubade?t=half+past+four');
      await render();

      expect(fixture.componentInstance.state()).toBeTruthy();
    });
  });

  describe('the invitation', () => {
    it('is offered while the hotel is shut', async () => {
      // Mandatory, per AUBADE, and it must be obvious: a hiring manager opening
      // the link at two on a Tuesday has to reach the whole work in one click.
      setHour('shuttered');
      await render();

      expect(text()).toContain('The night rooms can be opened for you');
      expect(button()).not.toBeNull();
    });

    it('is not offered at an hour the hotel opens by itself', async () => {
      await render();
      expect(button()).toBeNull();
    });

    it('opens the night rooms, and says what it left behind', async () => {
      setHour('shuttered');
      await render();

      button()?.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.invited()).toBe(true);
      expect(text()).toContain('under the door');
      // One way. A door with a handle on both sides is a toggle, and the refusal
      // stops being a position and becomes a preference.
      expect(button()).toBeNull();
    });

    it('repaints a held frame when it is taken', async () => {
      // A reduced-motion visitor just asked for a different room, and a stopped
      // loop is not going to draw one on its own.
      setReducedMotion(true);
      setHour('shuttered');
      await render();
      expect(gl?.callsTo('drawArrays')).toHaveLength(1);

      button()?.click();

      expect(gl?.callsTo('drawArrays')).toHaveLength(2);
    });
  });

  describe('the card on the desk', () => {
    it('is there in daylight, with a countdown', async () => {
      setHour('shuttered');
      await render();

      expect(text()).toContain('The sun goes down');
      expect(text()).toContain('The hotel opens later');
    });

    it('says a different thing where the sun does not go down today', async () => {
      // Midsummer at 78°N. The countdown is still a real number — `readClock`
      // searches forward for 400 days and finds a sunset in August — but it is
      // two months out, so there is no time to print at the top and a bare
      // countdown would read as broken rather than as the fact it is.
      //
      // The instant is pinned as well as the zone: this is the one assertion in
      // the file whose answer depends on the season, and it would flip in
      // September.
      window.history.replaceState({}, '', '/aubade?t=2026-06-21T12:00:00Z&tz=Arctic/Longyearbyen');
      await render();

      const card = fixture.componentInstance.sunsetCard();
      expect(fixture.componentInstance.state()).toBe('shuttered');
      expect(card?.today).toBe(false);
      expect(text()).toContain('The sun does not go down here today');
      expect(text()).toContain('No sunset today');
      expect(text()).not.toContain('The hotel opens later');
    });

    it('is not there in the dark', async () => {
      // A countdown to sunset shown to somebody standing in the dark answers a
      // question nobody asked.
      await render();

      expect(fixture.componentInstance.sunsetCard()).toBeNull();
      expect(text()).not.toContain('The sun goes down');
    });
  });

  describe('with WebGL2', () => {
    it('shows the canvas and starts the room', async () => {
      await render();

      expect(canvas()).not.toBeNull();
      expect(fixture.componentInstance.mode()).toBe('running');
    });

    it('gives the canvas an accessible name, since to a screen reader it is one picture', async () => {
      await render();

      const stage = canvas();
      expect(stage?.getAttribute('role')).toBe('img');
      expect(stage?.getAttribute('aria-label') ?? '').toContain('lobby');
    });

    it('asks for a context only after the view exists', async () => {
      // AUBADE's second non-negotiable is that the piece costs the rest of the
      // site nothing, which rests on the renderer being behind a dynamic import
      // — asserted structurally by `npm run check:docs`, since no runtime test
      // can see a bundler's chunk boundaries. What is checkable here is the
      // other half: constructing the component touches no GL at all.
      const asked = vi.mocked(HTMLCanvasElement.prototype.getContext);
      fixture = TestBed.createComponent(Aubade);

      expect(asked).not.toHaveBeenCalled();

      fixture.detectChanges();
      await settle();

      expect(asked).toHaveBeenCalledWith('webgl2', expect.anything());
    });
  });

  describe('under prefers-reduced-motion', () => {
    it('draws one still frame and stops', async () => {
      // The concept-level reading the spec asks for: not a slower camera, no
      // camera. A still raymarched interior is a perfectly good picture, which
      // is what makes that instruction followable.
      setReducedMotion(true);
      await render();

      expect(fixture.componentInstance.mode()).toBe('still');
      expect(gl?.callsTo('drawArrays')).toHaveLength(1);
    });

    it('says the room is holding still, rather than looking broken', async () => {
      setReducedMotion(true);
      await render();

      expect(text()).toContain('holding their breath');
    });
  });

  describe('without WebGL2', () => {
    it('renders no canvas at all', async () => {
      setWebGL2(false);
      await render();

      expect(fixture.componentInstance.mode()).toBe('closed');
      expect(canvas()).toBeNull();
    });

    it('says why, and gives the room in words instead', async () => {
      setWebGL2(false);
      await render();

      expect(text()).toContain('no WebGL2');
      expect(text()).toContain('transom');
    });
  });

  describe('resizing', () => {
    /**
     * jsdom has no `ResizeObserver` — `test-setup.ts` installs a no-op stub so
     * components that construct one are mountable. This replaces that stub with
     * one the test can fire, the same way `scroll-reveal.directive.spec.ts`
     * handles `IntersectionObserver`.
     */
    let fireResize: (() => void) | null = null;

    beforeEach(() => {
      fireResize = null;
      class RecordingResizeObserver {
        constructor(callback: () => void) {
          fireResize = callback;
        }
        public observe(): void {}
        public unobserve(): void {}
        public disconnect(): void {}
      }
      vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
    });

    it('re-measures and repaints a stopped loop', async () => {
      // A reduced-motion visitor who resizes the window would otherwise be left
      // looking at one still frame stretched over a differently-shaped canvas.
      setReducedMotion(true);
      await render();
      expect(gl?.callsTo('drawArrays')).toHaveLength(1);

      fireResize?.();

      expect(gl?.callsTo('drawArrays')).toHaveLength(2);
    });

    it('does not draw an extra frame while the loop is running', async () => {
      // The running loop will pick the new size up on its next frame; drawing
      // here as well would double the work during a window drag, which is
      // exactly when there is least of it to spare.
      await render();
      const before = gl?.callsTo('drawArrays').length ?? 0;

      fireResize?.();

      expect(gl?.callsTo('drawArrays')).toHaveLength(before);
    });
  });

  describe('when the context goes away', () => {
    it('stops and says so rather than leaving a black rectangle', async () => {
      // Not rare: a driver update, a laptop switching graphics, or a browser
      // deciding another tab needs the memory more.
      await render();
      expect(fixture.componentInstance.mode()).toBe('running');

      const lost = new Event('webglcontextlost', { cancelable: true });
      canvas()?.dispatchEvent(lost);
      fixture.detectChanges();

      // Cancelling the default is what leaves the context eligible for
      // restoration; without it the loss is permanent.
      expect(lost.defaultPrevented).toBe(true);
      expect(fixture.componentInstance.mode()).toBe('closed');
    });

    it('stops the loop when a frame reports it drew nothing', async () => {
      // The renderer returns false rather than throwing; the component's job is
      // to believe it. A loop that carries on calling into a dead context burns
      // a core for as long as the tab is open and draws nothing at all.
      setReducedMotion(true);
      gl = new StubWebGL2({ contextLost: true });
      await render();

      expect(fixture.componentInstance.mode()).toBe('still');
      expect(gl.called('drawArrays')).toBe(false);
    });
  });

  describe('leaving the route', () => {
    it('gives the GPU context back', async () => {
      // A single-page app destroys the component and not the allocation behind
      // the canvas. A visitor wandering between routes a few times can
      // accumulate contexts until the browser starts evicting the oldest — at
      // which point some other tab's WebGL goes black.
      await render();
      fixture.destroy();

      expect(gl?.called('deleteProgram')).toBe(true);
      expect(gl?.contextLost).toBe(true);
    });

    it('survives being destroyed before the renderer chunk arrives', async () => {
      // Rare, entirely possible on a slow connection, and it leaks a context
      // every time if the resolved renderer is not disposed.
      fixture = TestBed.createComponent(Aubade);
      fixture.detectChanges();
      fixture.destroy();

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // Never drew, and gave back whatever the import handed it on arrival.
      expect(gl?.called('drawArrays')).toBe(false);
      expect(gl?.contextLost).toBe(true);
    });
  });
});
