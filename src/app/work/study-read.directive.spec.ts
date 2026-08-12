import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnalyticsService } from '../services/analytics.service';
import { MINIMUM_DWELL_MS, StudyReadDirective, countsAsRead } from './study-read.directive';

/**
 * `countsAsRead` is the whole rule, so it is tested as a rule — directly, on
 * numbers, without a DOM. The directive tests below only check that it is
 * asked the right question and that the answer is acted on once.
 */
describe('countsAsRead', () => {
  const DWELL = 20_000;

  it('is false before the reader has seen any of the study', () => {
    expect(countsAsRead(null, false, 90_000, DWELL)).toBe(false);
  });

  it('is false while the reader has not reached the end, however long they linger', () => {
    expect(countsAsRead(0, false, 600_000, DWELL)).toBe(false);
  });

  it('is false when the end was reached too fast to have been read', () => {
    // Arrived and hit the bottom inside five seconds: a scroll, not a read.
    expect(countsAsRead(0, true, 5_000, DWELL)).toBe(false);
  });

  it('is false one millisecond under the floor', () => {
    expect(countsAsRead(0, true, DWELL - 1, DWELL)).toBe(false);
  });

  it('is true exactly on the floor', () => {
    expect(countsAsRead(0, true, DWELL, DWELL)).toBe(true);
  });

  it('is true once the end is reached and the dwell is satisfied', () => {
    expect(countsAsRead(0, true, 60_000, DWELL)).toBe(true);
  });

  /**
   * The case that decides the shape of the signature. On a tall screen the
   * whole study can be on screen at once, so it starts and ends at the same
   * instant; measuring dwell as `end - start` would score that reader zero no
   * matter how long they sat there, and they are the most engaged reader on the
   * page. Reaching the end is therefore a flag rather than a second timestamp.
   */
  it('is true for a study that was visible in its entirety from the start', () => {
    expect(countsAsRead(1_000, true, 1_000 + DWELL, DWELL)).toBe(true);
  });

  /** Defensive: the directive cannot produce this, and the rule still holds. */
  it('is false when the end was somehow seen before the study was', () => {
    expect(countsAsRead(null, true, 60_000, DWELL)).toBe(false);
  });
});

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
  selector: 'app-study-read-host',
  imports: [StudyReadDirective],
  template: `
    <article appStudyRead="a-slug" data-testid="study">
      <p>the study</p>
      <div data-study-end></div>
    </article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StudyReadHost {}

describe('StudyReadDirective', () => {
  let fixture: ComponentFixture<StudyReadHost>;
  let track: ReturnType<typeof vi.fn>;

  const article = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="study"]') as HTMLElement;
  const endMarker = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-study-end]') as HTMLElement;

  /** The two fields the directive reads, without hand-building a full entry. */
  const intersection = (target: Element, isIntersecting = true): IntersectionObserverEntry =>
    ({ isIntersecting, target }) as unknown as IntersectionObserverEntry;

  const fire = (...entries: IntersectionObserverEntry[]): void => {
    lastObserver?.callback(entries, {} as IntersectionObserver);
  };

  beforeEach(async () => {
    lastObserver = null;
    track = vi.fn();
    globalThis.IntersectionObserver =
      RecordingIntersectionObserver as unknown as typeof IntersectionObserver;

    await TestBed.configureTestingModule({
      imports: [StudyReadHost],
      providers: [{ provide: AnalyticsService, useValue: { track } }],
    }).compileComponents();

    fixture = TestBed.createComponent(StudyReadHost);
    await fixture.whenStable();

    // Only now. Angular's own bootstrap awaits real timers, so faking the clock
    // before the fixture is stable hangs the hook rather than the test — which
    // presents as a timeout in `beforeEach` with nothing to point at. The
    // directive reads the clock in the observer callback and never during
    // `ngOnInit`, so nothing it cares about has happened yet.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('watches both the study and its end marker', () => {
    expect(lastObserver?.observed).toEqual([article(), endMarker()]);
  });

  it('reports nothing for a reader who never reaches the end', () => {
    fire(intersection(article()));
    vi.advanceTimersByTime(MINIMUM_DWELL_MS * 10);

    expect(track).not.toHaveBeenCalled();
  });

  it('reports nothing for a reader who reaches the end immediately', () => {
    fire(intersection(article()), intersection(endMarker()));

    expect(track).not.toHaveBeenCalled();
  });

  /**
   * The re-ask. Intersection callbacks fire on change, and a reader sitting
   * still on a study generates none — so the moment the end scrolls into view
   * is the one moment the dwell is guaranteed not to be satisfied yet. Without
   * the timer this event would never fire for anybody.
   */
  it('reports the study once the dwell elapses with no further scrolling', () => {
    fire(intersection(article()), intersection(endMarker()));
    vi.advanceTimersByTime(MINIMUM_DWELL_MS);

    expect(track).toHaveBeenCalledExactlyOnceWith('case_study_read', { study: 'a-slug' });
  });

  it('reports a study read slowly, at the moment the end comes into view', () => {
    fire(intersection(article()));
    vi.advanceTimersByTime(MINIMUM_DWELL_MS * 2);
    fire(intersection(endMarker()));

    expect(track).toHaveBeenCalledExactlyOnceWith('case_study_read', { study: 'a-slug' });
  });

  it('reports a study only once, however much it is scrolled over afterwards', () => {
    fire(intersection(article()), intersection(endMarker()));
    vi.advanceTimersByTime(MINIMUM_DWELL_MS);
    fire(intersection(article()), intersection(endMarker()));
    vi.advanceTimersByTime(MINIMUM_DWELL_MS);

    expect(track).toHaveBeenCalledTimes(1);
  });

  it('ignores entries that are leaving the viewport', () => {
    fire(intersection(article(), false), intersection(endMarker(), false));
    vi.advanceTimersByTime(MINIMUM_DWELL_MS * 2);

    expect(track).not.toHaveBeenCalled();
  });

  it('stops watching, and stops its pending timer, when the page is left', () => {
    fire(intersection(article()), intersection(endMarker()));
    fixture.destroy();
    vi.advanceTimersByTime(MINIMUM_DWELL_MS * 2);

    expect(lastObserver?.disconnected).toBe(true);
    expect(track).not.toHaveBeenCalled();
  });
});
