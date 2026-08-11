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

vi.mock('chart.js', () => {
  class MockChart {
    public data: ChartConfiguration['data'];
    public readonly update = vi.fn();
    public readonly destroy = vi.fn();

    constructor(
      public readonly ctx: unknown,
      public readonly config: ChartConfiguration
    ) {
      this.data = config.data;
      chartRegistry.instances.push(this as unknown as IMockChart);
    }

    public static register(): void {}
  }

  return { Chart: MockChart, registerables: [] };
});

interface IMockChart {
  readonly ctx: unknown;
  readonly config: ChartConfiguration;
  data: ChartConfiguration['data'];
  readonly update: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

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
});
