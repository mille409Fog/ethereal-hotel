import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScrollRevealDirective } from './scroll-reveal.directive';

/**
 * The directive parks an element at `opacity: 0` (via the `.scroll-reveal`
 * class) and only reveals it once an IntersectionObserver says it is on screen.
 * That makes reduced-motion support a correctness issue rather than a polish
 * one: if the class is applied but the transition is disabled, the content
 * never becomes visible at all.
 *
 * These tests drive the observer directly, since jsdom's stub (see
 * `test-setup.ts`) never fires on its own.
 */

/** Captures the observer the directive constructs so a test can fire it. */
interface IObserverSpy {
  callback: IntersectionObserverCallback;
  observed: Element[];
  disconnected: boolean;
}

let lastObserver: IObserverSpy | null = null;

class RecordingIntersectionObserver {
  private readonly spy: IObserverSpy;

  constructor(callback: IntersectionObserverCallback) {
    this.spy = { callback, observed: [], disconnected: false };
    lastObserver = this.spy;
  }

  public observe(element: Element): void {
    this.spy.observed.push(element);
  }

  public unobserve(): void {}

  public disconnect(): void {
    this.spy.disconnected = true;
  }

  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

@Component({
  selector: 'app-scroll-reveal-host',
  imports: [ScrollRevealDirective],
  template: '<div appScrollReveal data-testid="target">content</div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ScrollRevealHost {}

describe('ScrollRevealDirective', () => {
  let fixture: ComponentFixture<ScrollRevealHost>;

  const target = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="target"]') as HTMLElement;

  /**
   * Pretends the user has, or has not, asked for reduced motion.
   *
   * Assigned rather than spied on: jsdom does not implement `matchMedia` at
   * all, so `vi.spyOn` has no function to wrap. That absence is the reason
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

  const render = async (): Promise<void> => {
    fixture = TestBed.createComponent(ScrollRevealHost);
    await fixture.whenStable();
  };

  /** The one field the directive reads, without hand-building a full entry. */
  const intersection = (isIntersecting: boolean): IntersectionObserverEntry =>
    ({ isIntersecting, target: target() }) as unknown as IntersectionObserverEntry;

  beforeEach(async () => {
    lastObserver = null;
    globalThis.IntersectionObserver =
      RecordingIntersectionObserver as unknown as typeof IntersectionObserver;

    await TestBed.configureTestingModule({ imports: [ScrollRevealHost] }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  describe('with motion allowed', () => {
    beforeEach(async () => {
      setReducedMotion(false);
      await render();
    });

    it('hides the element and watches for it to scroll into view', () => {
      expect(target().classList.contains('scroll-reveal')).toBe(true);
      expect(lastObserver?.observed).toEqual([target()]);
    });

    it('reveals the element once it intersects the viewport', () => {
      lastObserver?.callback([intersection(true)], {} as IntersectionObserver);

      expect(target().classList.contains('revealed')).toBe(true);
    });

    it('leaves the element hidden while it is still off screen', () => {
      lastObserver?.callback([intersection(false)], {} as IntersectionObserver);

      expect(target().classList.contains('revealed')).toBe(false);
    });

    it('disconnects the observer when the host is destroyed', () => {
      fixture.destroy();

      expect(lastObserver?.disconnected).toBe(true);
    });
  });

  describe('with reduced motion requested', () => {
    beforeEach(async () => {
      setReducedMotion(true);
      await render();
    });

    /**
     * The important one. Disabling only the transition would leave the element
     * at `opacity: 0` forever, so the directive has to opt out entirely rather
     * than opt out of the animation.
     */
    it('leaves the element visible instead of hiding it behind an animation', () => {
      expect(target().classList.contains('scroll-reveal')).toBe(false);
    });

    it('never creates an observer at all', () => {
      expect(lastObserver).toBeNull();
    });
  });
});
