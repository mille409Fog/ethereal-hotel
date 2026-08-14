import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Aubade } from './aubade';
import { StubWebGL2 } from './gl/webgl.testing';

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
 */

describe('the aubade route', () => {
  let fixture: ComponentFixture<Aubade>;
  let gl: StubWebGL2 | null;

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

  beforeEach(async () => {
    // No frames ever fire; see the file comment.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    setReducedMotion(false);
    setWebGL2(true);

    await TestBed.configureTestingModule({ imports: [Aubade] }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
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
      await render();
      expect(text()).toContain('Floor 0 of six');
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

      expect(text()).toContain('holding its breath');
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
