import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MetricsGrid } from './metrics-grid';
import { IMetrics } from '../../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../../services/offline-dashboard.fixture';

/**
 * The grid is presentational, but it does two pieces of arithmetic the rest of
 * the dashboard depends on being right: how much inventory is out of service,
 * and which way the house is moving today.
 */

/** The committed fixture with a few fields moved, so each case reads clearly. */
const metricsWith = (overrides: Partial<IMetrics>): IMetrics => ({
  ...OFFLINE_DASHBOARD.metrics,
  ...overrides,
});

describe('MetricsGrid', () => {
  let fixture: ComponentFixture<MetricsGrid>;

  /** Applies `metrics`, lets the view settle, and hands back the rendered text. */
  const render = async (metrics: IMetrics): Promise<string> => {
    fixture.componentRef.setInput('metrics', metrics);
    await fixture.whenStable();
    return fixture.nativeElement.textContent as string;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MetricsGrid],
    }).compileComponents();

    fixture = TestBed.createComponent(MetricsGrid);
  });

  it('falls back to the committed fixture when no metrics are supplied', async () => {
    await fixture.whenStable();

    expect(fixture.componentInstance.metrics()).toEqual(OFFLINE_DASHBOARD.metrics);
    expect(fixture.nativeElement.textContent).toContain('Occupancy');
  });

  describe('outOfServiceRooms', () => {
    it('counts the rooms held back from the sellable inventory', async () => {
      const text = await render(metricsWith({ totalRooms: 40, operationalRooms: 36 }));

      expect(fixture.componentInstance.outOfServiceRooms()).toBe(4);
      expect(text).toContain('4 out of service');
    });

    it('clamps at zero when every room is sellable', async () => {
      await render(metricsWith({ totalRooms: 40, operationalRooms: 40 }));

      expect(fixture.componentInstance.outOfServiceRooms()).toBe(0);
    });

    // Guards against a bad backend read showing a negative room count on screen.
    it('clamps at zero when operational somehow exceeds total', async () => {
      await render(metricsWith({ totalRooms: 30, operationalRooms: 34 }));

      expect(fixture.componentInstance.outOfServiceRooms()).toBe(0);
    });
  });

  describe('netRoomsMovement', () => {
    it('reads a filling house as a positive net', async () => {
      const text = await render(metricsWith({ arrivalsToday: 9, departuresToday: 4 }));

      expect(fixture.componentInstance.netRoomsMovement()).toBe(5);
      expect(text).toContain('Net +5 rooms filling today');
    });

    it('reads an emptying house as a negative net', async () => {
      const text = await render(metricsWith({ arrivalsToday: 3, departuresToday: 8 }));

      expect(fixture.componentInstance.netRoomsMovement()).toBe(-5);
      expect(text).toContain('Net -5 rooms emptying today');
    });

    it('reads a matched day as even turnover', async () => {
      const text = await render(metricsWith({ arrivalsToday: 6, departuresToday: 6 }));

      expect(fixture.componentInstance.netRoomsMovement()).toBe(0);
      expect(text).toContain('Even turnover today');
    });
  });

  /**
   * The socket pushes a snapshot every 2 seconds. The grid is therefore
   * deliberately *not* a live region — announcing six cards at that cadence
   * buries the user in speech they cannot outrun. One throttled digest is, and
   * these tests hold that design in place: an `aria-live` attribute appearing
   * on the grid, or this interval shrinking towards the socket's, would be a
   * regression that is invisible to anyone testing with their eyes.
   */
  describe('screen reader announcement', () => {
    /**
     * A fixture of its own, built *after* the fake clock is installed. The
     * announcement interval is started in the constructor, so a component
     * created under the real clock keeps a real interval and no amount of
     * `advanceTimersByTime` will move it.
     */
    let announcing: ComponentFixture<MetricsGrid>;

    const liveRegion = (): HTMLElement | null =>
      announcing.nativeElement.querySelector('[role="status"]');

    /** Advances past one announcement window and re-renders. */
    const tick = async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(30_000);
      announcing.detectChanges();
    };

    const setMetrics = (overrides: Partial<IMetrics>): void => {
      announcing.componentRef.setInput('metrics', metricsWith(overrides));
      announcing.detectChanges();
    };

    beforeEach(() => {
      vi.useFakeTimers();
      announcing = TestBed.createComponent(MetricsGrid);
      announcing.detectChanges();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not make the metrics grid itself a live region', () => {
      expect(announcing.nativeElement.querySelector('.metrics-grid[aria-live]')).toBeNull();
    });

    it('stays silent on first render rather than talking over page load', () => {
      expect(liveRegion()?.textContent?.trim()).toBe('');
    });

    it('announces a spoken digest of the headline numbers once the interval elapses', async () => {
      setMetrics({ occupancy: 85, occupiedRooms: 51, operationalRooms: 60, adr: 317 });

      await tick();

      const announcement = liveRegion()?.textContent ?? '';
      expect(announcement).toContain('Occupancy 85.0 percent');
      expect(announcement).toContain('51 of 60 sellable rooms occupied');
      // Spoken, not printed: "ADR" and "$" do not read aloud usefully.
      expect(announcement).toContain('average daily rate 317 dollars');
      expect(announcement).not.toContain('$');
    });

    it('tracks the latest metrics rather than the ones it first saw', async () => {
      setMetrics({ occupancy: 85 });
      await tick();

      setMetrics({ occupancy: 62.5 });
      await tick();

      expect(liveRegion()?.textContent).toContain('Occupancy 62.5 percent');
    });

    /**
     * The hosted demo sits on an unchanging fixture. Re-announcing an identical
     * sentence every 30 seconds forever would be its own accessibility problem.
     */
    it('does not repeat itself while the figures are unchanged', async () => {
      setMetrics({ occupancy: 85 });

      await tick();
      const first = liveRegion()?.textContent;
      await tick();

      // Identical text is a no-op write on a signal, so the DOM node is never
      // touched and assistive technology has nothing new to read.
      expect(first).toContain('Occupancy 85.0 percent');
      expect(liveRegion()?.textContent).toBe(first);
    });

    it('stops announcing once the component is destroyed', () => {
      const timersWhileAlive = vi.getTimerCount();
      announcing.destroy();

      // A surviving interval would keep writing to a detached component.
      expect(timersWhileAlive).toBeGreaterThan(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
