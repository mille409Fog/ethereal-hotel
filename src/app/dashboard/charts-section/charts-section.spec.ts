import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ChartConfiguration } from 'chart.js';
import { ChartsSection } from './charts-section';
import { IHistoricalData, IMetrics } from '../../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../../services/offline-dashboard.fixture';

/**
 * Chart.js needs a real 2D canvas, which jsdom does not provide, so these tests
 * stand a stub in its place and assert on the *configuration* the component
 * builds — the series it plots, the labels it derives, and the tooltip text.
 * That is the part of this component worth pinning down; the pixels are
 * Chart.js's problem.
 */

/** Records every chart the component builds, so a test can inspect its config. */
const chartRegistry = vi.hoisted(() => ({ instances: [] as IMockChart[] }));

const mockChartDefaults = vi.hoisted(() => ({ font: { family: '' } }));

vi.mock('chart.js', () => {
  class MockChart {
    public data: ChartConfiguration['data'];
    public readonly stop = vi.fn();
    public readonly update = vi.fn();
    public readonly destroy = vi.fn();

    constructor(
      public readonly ctx: unknown,
      public readonly config: ChartConfiguration
    ) {
      this.data = config.data;
      chartRegistry.instances.push(this as unknown as IMockChart);
    }

    public static readonly defaults = mockChartDefaults;

    public static register(): void {}
  }

  return { Chart: MockChart, registerables: [] };
});

interface IMockChart {
  readonly ctx: unknown;
  readonly config: ChartConfiguration;
  data: ChartConfiguration['data'];
  readonly stop: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

/** A y axis's tick callback, loosened so tests can call it. */
type TickFormat = (value: number | string) => string;

const yAxisOf = (chart: IMockChart): { callback: TickFormat; maxTicksLimit: number } =>
  (
    chart.config.options?.scales?.['y'] as unknown as {
      ticks: { callback: TickFormat; maxTicksLimit: number };
    }
  ).ticks;

/** What the doughnut's centre plugin drew on a recording context, in order. */
const drawnCentre = (chart: IMockChart): Array<{ text: string; x: number; font: string }> => {
  const drawn: Array<{ text: string; x: number; font: string }> = [];
  const ctx = {
    font: '',
    save: vi.fn(),
    restore: vi.fn(),
    fillText(text: string, x: number): void {
      drawn.push({ text, x, font: this.font });
    },
  };
  const plugin = (chart.config as { plugins?: Array<{ afterDatasetsDraw?: unknown }> })
    .plugins?.[0];
  (plugin?.afterDatasetsDraw as (target: unknown) => void)({
    ctx,
    chartArea: { left: 10, right: 110, top: 0, bottom: 200 },
  });
  return drawn;
};

/** Shape of the tooltip label callbacks, loosened so tests can call them. */
type TooltipLabel = (context: { label?: string; parsed: unknown }) => string;

const tooltipLabelOf = (chart: IMockChart): TooltipLabel =>
  chart.config.options?.plugins?.tooltip?.callbacks?.label as unknown as TooltipLabel;

/**
 * `ngAfterViewInit` defers chart creation by 100ms. Nothing in the component
 * exposes that timer, so wait past it rather than racing it — a race here is
 * exactly what makes function coverage differ between machines.
 */
const CHART_INIT_DELAY_MS = 100;
const afterChartInit = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, CHART_INIT_DELAY_MS + 50));

const guestHistory: IHistoricalData[] = [
  { timestamp: '2026-08-08', value: 31 },
  { timestamp: '2026-08-09', value: 44 },
];

const revenueHistory: IHistoricalData[] = [
  { timestamp: '2026-08-08', value: 8100 },
  { timestamp: '2026-08-09', value: 9400 },
];

const metricsWith = (overrides: Partial<IMetrics>): IMetrics => ({
  ...OFFLINE_DASHBOARD.metrics,
  ...overrides,
});

describe('ChartsSection', () => {
  let fixture: ComponentFixture<ChartsSection>;

  const [guestsChart, revenueChart, roomMixChart] = [0, 1, 2];

  /** Renders with the given inputs and waits for the deferred chart build. */
  const renderCharts = async (inputs: {
    metrics?: IMetrics;
    historicalGuests?: IHistoricalData[];
    historicalRevenue?: IHistoricalData[];
  }): Promise<IMockChart[]> => {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    await afterChartInit();
    return chartRegistry.instances;
  };

  beforeEach(async () => {
    chartRegistry.instances.length = 0;

    // jsdom's canvas has no 2D context; the component only needs a non-null one.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D
    );

    await TestBed.configureTestingModule({
      imports: [ChartsSection],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartsSection);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds one chart per canvas, in the expected forms', async () => {
    const charts = await renderCharts({});

    expect(charts).toHaveLength(3);
    expect(charts.map((chart) => chart.config.type)).toEqual(['line', 'bar', 'doughnut']);
  });

  it('plots the guest history against short day labels', async () => {
    const charts = await renderCharts({ historicalGuests: guestHistory });

    expect(charts[guestsChart].config.data.labels).toEqual(['Aug 8', 'Aug 9']);
    expect(charts[guestsChart].config.data.datasets[0].data).toEqual([31, 44]);
  });

  it('plots the revenue history against short day labels', async () => {
    const charts = await renderCharts({ historicalRevenue: revenueHistory });

    expect(charts[revenueChart].config.data.labels).toEqual(['Aug 8', 'Aug 9']);
    expect(charts[revenueChart].config.data.datasets[0].data).toEqual([8100, 9400]);
  });

  it('splits tonight’s inventory into sold, sellable and out of service', async () => {
    const charts = await renderCharts({
      metrics: metricsWith({
        occupiedRooms: 22,
        availableRooms: 14,
        operationalRooms: 36,
        totalRooms: 40,
      }),
    });

    expect(charts[roomMixChart].config.data.datasets[0].data).toEqual([22, 14, 4]);
  });

  it('never plots a negative out-of-service slice', async () => {
    const charts = await renderCharts({
      metrics: metricsWith({
        occupiedRooms: 20,
        availableRooms: 10,
        operationalRooms: 34,
        totalRooms: 30,
      }),
    });

    expect(charts[roomMixChart].config.data.datasets[0].data).toEqual([20, 10, 0]);
  });

  it('formats revenue tooltips as whole dollars', async () => {
    const charts = await renderCharts({ historicalRevenue: revenueHistory });

    expect(tooltipLabelOf(charts[revenueChart])({ parsed: { y: 9412.75 } })).toBe('$9,413');
  });

  it('names the room count in room-mix tooltips', async () => {
    const charts = await renderCharts({});

    expect(tooltipLabelOf(charts[roomMixChart])({ label: 'Occupied', parsed: 22 })).toBe(
      'Occupied: 22 rooms'
    );
  });

  it('hides the legend on both single-series charts and keeps it on the doughnut', async () => {
    const charts = await renderCharts({});

    const legendOf = (chart: IMockChart): unknown => chart.config.options?.plugins?.legend?.display;
    expect(legendOf(charts[guestsChart])).toBe(false);
    expect(legendOf(charts[revenueChart])).toBe(false);
    expect(legendOf(charts[roomMixChart])).toBeUndefined();
  });

  it('reads money as money on the revenue axis, and only there', async () => {
    const charts = await renderCharts({});

    expect(yAxisOf(charts[revenueChart]).callback(12000)).toBe('$12,000');
    expect(yAxisOf(charts[guestsChart]).callback(1200)).toBe('1,200');
  });

  it('keeps vertical rules out of the plots and limits the horizontal ones', async () => {
    const charts = await renderCharts({});

    for (const chart of [charts[guestsChart], charts[revenueChart]]) {
      expect(chart.config.options?.scales?.['x']?.grid?.display).toBe(false);
      expect(yAxisOf(chart).maxTicksLimit).toBe(5);
    }
  });

  describe('occupancy in the doughnut', () => {
    it('draws the figure over the centre of the chart area, with its denominator', async () => {
      const charts = await renderCharts({ metrics: metricsWith({ occupancy: 85 }) });

      expect(drawnCentre(charts[roomMixChart]).map(({ text, x }) => [text, x])).toEqual([
        ['85.0%', 60],
        ['of sellable rooms', 60],
      ]);
    });

    // 84.35 is the value `toFixed` would round the other way from the metric
    // card. `metrics-grid.spec.ts` pins the card to the same answer.
    it('rounds the way the metric card does', async () => {
      const charts = await renderCharts({ metrics: metricsWith({ occupancy: 84.35 }) });

      expect(drawnCentre(charts[roomMixChart])[0].text).toBe('84.4%');
    });

    it('follows the metrics without rebuilding the chart', async () => {
      const charts = await renderCharts({ metrics: metricsWith({ occupancy: 85 }) });
      const chart = charts[roomMixChart];
      chart.update.mockClear();

      fixture.componentRef.setInput('metrics', metricsWith({ occupancy: 62.5 }));
      await fixture.whenStable();

      expect(chart.update).toHaveBeenCalledWith('none');
      expect(drawnCentre(chart)[0].text).toBe('62.5%');
    });
  });

  describe('the body face', () => {
    const FAMILY = "'Source Sans 3', sans-serif";
    let load: ReturnType<typeof vi.fn>;
    let settleFont: () => void;

    beforeEach(() => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: (name: string) => (name === '--font-sans' ? FAMILY : ''),
      } as unknown as CSSStyleDeclaration);

      load = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            settleFont = resolve;
          })
      );
      // jsdom has no font loading at all, so this is defined rather than spied.
      Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    });

    afterEach(() => {
      Reflect.deleteProperty(document, 'fonts');
      vi.useRealTimers();
    });

    it('draws nothing until the face has loaded, then draws in it', async () => {
      await renderCharts({});

      expect(load).toHaveBeenCalledWith(`12px ${FAMILY}`);
      expect(chartRegistry.instances).toHaveLength(0);

      settleFont();
      await afterChartInit();

      expect(chartRegistry.instances).toHaveLength(3);
      expect(mockChartDefaults.font.family).toBe(FAMILY);
      expect(drawnCentre(chartRegistry.instances[roomMixChart])[0].font).toContain(FAMILY);
    });

    it('still draws if the face fails to load', async () => {
      load.mockRejectedValue(new Error('network'));

      const charts = await renderCharts({});

      expect(charts).toHaveLength(3);
    });

    it('stops waiting for a font that never answers', async () => {
      vi.useFakeTimers();
      fixture.detectChanges();

      await vi.advanceTimersByTimeAsync(CHART_INIT_DELAY_MS);
      expect(chartRegistry.instances).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(3000);
      expect(chartRegistry.instances).toHaveLength(3);
    });

    it('builds nothing if the route is left during the wait', async () => {
      await renderCharts({});

      fixture.destroy();
      settleFont();
      await afterChartInit();

      expect(chartRegistry.instances).toHaveLength(0);
    });
  });

  it('re-points the existing charts when the inputs change, without rebuilding them', async () => {
    const charts = await renderCharts({ historicalGuests: guestHistory });
    expect(charts).toHaveLength(3);

    fixture.componentRef.setInput('historicalGuests', [
      { timestamp: '2026-08-10', value: 52 },
    ] satisfies IHistoricalData[]);
    await fixture.whenStable();

    // Same three chart instances, re-pointed rather than recreated.
    expect(chartRegistry.instances).toHaveLength(3);
    expect(charts[guestsChart].data.labels).toEqual(['Aug 10']);
    expect(charts[guestsChart].data.datasets[0].data).toEqual([52]);
    // Animation is off so the 2s live feed does not judder.
    expect(charts[guestsChart].update).toHaveBeenCalledWith('none');
  });

  // `update('none')` does not touch a running animation, which would otherwise
  // finish on the data the chart was built from. `e2e/dashboard.spec.ts` proves
  // the pixels; this pins the order, across all three charts, where it is cheap.
  it('cancels running animations before drawing new data on every chart', async () => {
    const charts = await renderCharts({});
    for (const chart of charts) {
      chart.stop.mockClear();
      chart.update.mockClear();
    }

    fixture.componentRef.setInput('metrics', metricsWith({ occupiedRooms: 1 }));
    await fixture.whenStable();

    for (const chart of charts) {
      expect(chart.stop).toHaveBeenCalledTimes(1);
      expect(chart.stop.mock.invocationCallOrder[0]).toBeLessThan(
        chart.update.mock.invocationCallOrder[0]
      );
    }
  });

  it('tears down every chart on destroy', async () => {
    const charts = await renderCharts({});

    fixture.destroy();

    for (const chart of charts) {
      expect(chart.destroy).toHaveBeenCalledTimes(1);
    }
  });

  it('builds nothing when the canvases have no 2D context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const charts = await renderCharts({});

    expect(charts).toHaveLength(0);
  });

  /**
   * A `<canvas>` is a bitmap. Without a text alternative all three charts are
   * simply absent for anyone not looking at the screen, and nothing in the
   * rendered pixels can tell you that has regressed.
   */
  describe('text alternatives', () => {
    const labelOf = (canvasId: string): string =>
      fixture.nativeElement.querySelector(`#${canvasId}`)?.getAttribute('aria-label') ?? '';

    it('exposes every canvas as a labelled image', async () => {
      await renderCharts({});

      for (const id of ['guestsChart', 'revenueChart', 'roomMixChart']) {
        const canvas = fixture.nativeElement.querySelector(`#${id}`);
        expect(canvas?.getAttribute('role')).toBe('img');
        expect(labelOf(id).length).toBeGreaterThan(0);
      }
    });

    it('describes the guest series by window, range and latest value', async () => {
      await renderCharts({ historicalGuests: guestHistory });

      expect(labelOf('guestsChart')).toBe(
        'Guests in house per night, Aug 8 to Aug 9, ranging from 31 guests to 44 guests, most recently 44 guests.'
      );
    });

    it('describes revenue in whole dollars rather than reading a chart axis', async () => {
      await renderCharts({ historicalRevenue: revenueHistory });

      expect(labelOf('revenueChart')).toBe(
        'Room revenue per night, Aug 8 to Aug 9, ranging from 8,100 dollars to 9,400 dollars, most recently 9,400 dollars.'
      );
    });

    it('describes the room mix as its three counts and the figure in its centre', async () => {
      await renderCharts({
        metrics: metricsWith({
          occupancy: 85,
          occupiedRooms: 51,
          availableRooms: 9,
          totalRooms: 64,
          operationalRooms: 60,
        }),
      });

      expect(labelOf('roomMixChart')).toBe(
        'Room inventory tonight: 51 occupied, 9 available, 4 out of service. ' +
          'Occupancy 85.0 percent of sellable rooms.'
      );
    });

    it('says so rather than inventing a range when a series is empty', async () => {
      await renderCharts({ historicalGuests: [] });

      expect(labelOf('guestsChart')).toBe('Guests in house per night. No data available.');
    });

    it('keeps the description in step with the data it plots', async () => {
      await renderCharts({ historicalGuests: guestHistory });

      fixture.componentRef.setInput('historicalGuests', [
        { timestamp: '2026-08-10', value: 12 },
        { timestamp: '2026-08-11', value: 77 },
      ]);
      await fixture.whenStable();

      expect(labelOf('guestsChart')).toContain('Aug 10 to Aug 11');
      expect(labelOf('guestsChart')).toContain('most recently 77 guests');
    });
  });
});
