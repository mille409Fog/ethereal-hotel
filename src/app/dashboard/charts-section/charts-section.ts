import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  input,
} from '@angular/core';
import { Chart, ChartConfiguration, Plugin, registerables } from 'chart.js';
import { IHistoricalData, IMetrics } from '../../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../../services/offline-dashboard.fixture';
import { formatOccupancy } from '../occupancy';

// Register Chart.js components
Chart.register(...registerables);

/**
 * How long the charts will wait for the body face. Long enough for a slow
 * connection, short enough that a stalled font cannot leave three blank cards;
 * past it they draw in the fallback and the next update picks the face up.
 */
const FONT_WAIT_MS = 3000;

/**
 * The palette every chart draws in, read from the tokens in `src/styles.css`
 * when the charts are built. Chart.js paints a canvas, and a canvas cannot
 * resolve `var()`, so the values are looked up rather than copied: a copy is
 * how this file once held a red that the stylesheet no longer did.
 *
 * The tokens must stay six-digit hex, because `translucent` appends an alpha
 * byte to them. Outside a browser stylesheet (the unit tests) every lookup is
 * empty and Chart.js falls back to its defaults, which is all a test needs.
 */
interface IChartPalette {
  readonly family: string;
  readonly accent: string;
  readonly text: string;
  readonly label: string;
  readonly muted: string;
  readonly surface: string;
  readonly border: string;
  readonly inactive: string;
}

function readPalette(): IChartPalette {
  const style = window.getComputedStyle(document.documentElement);
  const token = (name: string): string => style.getPropertyValue(name).trim();
  return {
    family: token('--font-sans'),
    accent: token('--color-accent'),
    text: token('--color-text'),
    label: token('--color-text-secondary'),
    muted: token('--color-text-muted'),
    surface: token('--color-surface'),
    border: token('--color-border'),
    inactive: token('--color-inactive'),
  };
}

/**
 * Settles once the body face can be drawn, or once waiting has stopped being
 * worthwhile. A canvas keeps whatever it was painted with: a late font swaps in
 * for all the HTML and leaves the charts in the fallback until they next redraw.
 * A failed load still settles, because a chart in the fallback is better than
 * none.
 */
function fontLoaded(family: string): Promise<unknown> {
  if (!family) {
    return Promise.resolve();
  }
  return Promise.race([
    document.fonts.load(`12px ${family}`).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
  ]);
}

/** `#rrggbb` at `alpha` in [0, 1], as `#rrggbbaa`; empty stays empty. */
function translucent(hex: string, alpha: number): string {
  return hex
    ? `${hex}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')}`
    : hex;
}

interface ITooltipStyle {
  readonly backgroundColor: string;
  readonly titleColor: string;
  readonly bodyColor: string;
  readonly borderColor: string;
  readonly borderWidth: number;
}

/** Tooltip styling repeated across all three configs. */
function tooltipStyle(palette: IChartPalette): ITooltipStyle {
  return {
    backgroundColor: palette.surface,
    titleColor: palette.text,
    bodyColor: palette.label,
    borderColor: palette.border,
    borderWidth: 1,
  };
}

/** Whole dollars, for the revenue axis and its tooltip alike. */
function dollars(value: number | string): string {
  return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Draws the occupancy figure in the doughnut's hole. A plugin rather than an
 * element laid over the canvas because the hole's centre is not the card's: the
 * legend takes the bottom of the canvas, and only `chartArea` knows by how much.
 *
 * `figure` is read at draw time, so the number is whatever the metric card says
 * now; the effect in the constructor redraws on every change to the metrics.
 *
 * The caption is what stops the figure reading as wrong. Occupancy is measured
 * against sellable rooms and the ring also holds the out-of-service ones, so
 * the two are different fractions whenever a room is out of service.
 */
function occupancyCentre(palette: IChartPalette, figure: () => string): Plugin<'doughnut'> {
  return {
    id: 'occupancyCentre',
    afterDatasetsDraw: ({ ctx, chartArea: { left, right, top, bottom } }) => {
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = palette.text;
      ctx.font = `600 28px ${palette.family}`;
      ctx.fillText(`${figure()}%`, x, y - 8);
      ctx.fillStyle = palette.muted;
      ctx.font = `12px ${palette.family}`;
      ctx.fillText('of sellable rooms', x, y + 16);
      ctx.restore();
    },
  };
}

/** A chart-ready daily series: axis labels and the values plotted against them. */
interface ISeries {
  labels: string[];
  data: number[];
}

@Component({
  selector: 'app-charts-section',
  imports: [],
  templateUrl: './charts-section.html',
  styleUrl: './charts-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartsSection implements AfterViewInit, OnDestroy {
  public readonly metrics = input<IMetrics>(OFFLINE_DASHBOARD.metrics);
  public readonly historicalGuests = input<IHistoricalData[]>(OFFLINE_DASHBOARD.historicalGuests);
  public readonly historicalRevenue = input<IHistoricalData[]>(OFFLINE_DASHBOARD.historicalRevenue);

  private guestsChart?: Chart;
  private revenueChart?: Chart;
  private roomMixChart?: Chart<'doughnut'>;
  private destroyed = false;

  /** Guests in house per night, shaped for the line chart. */
  private readonly guestSeries = computed(() => ChartsSection.toSeries(this.historicalGuests()));

  /** Room revenue per night, shaped for the bar chart. */
  private readonly revenueSeries = computed(() => ChartsSection.toSeries(this.historicalRevenue()));

  /** How tonight's physical inventory splits: sold, sellable, out of service. */
  private readonly roomMix = computed(() => {
    const { occupiedRooms, availableRooms, totalRooms, operationalRooms } = this.metrics();
    return [occupiedRooms, availableRooms, Math.max(totalRooms - operationalRooms, 0)];
  });

  /** The figure in the doughnut's centre, in the metric card's own format. */
  private readonly occupancy = computed(() => formatOccupancy(this.metrics().occupancy));

  /**
   * Text alternatives for the three canvases.
   *
   * A `<canvas>` is a bitmap: to a screen reader an unlabelled one is an empty
   * box, so all three charts were simply missing from the page. These are
   * computed from the same signals the charts plot, which means the description
   * cannot drift away from the picture the way a hand-written summary would —
   * and it says what the shape of the data *is* (range, latest) rather than
   * just naming the chart, since "line chart of revenue" tells a listener
   * nothing they could not guess from the heading.
   */
  public readonly guestsChartLabel = computed(() =>
    ChartsSection.describeSeries(
      'Guests in house per night',
      this.guestSeries(),
      (value) => `${value} guests`
    )
  );

  public readonly revenueChartLabel = computed(() =>
    ChartsSection.describeSeries(
      'Room revenue per night',
      this.revenueSeries(),
      (value) => `${Math.round(value).toLocaleString('en-US')} dollars`
    )
  );

  public readonly roomMixChartLabel = computed(() => {
    const [occupied, available, outOfService] = this.roomMix();
    return (
      `Room inventory tonight: ${occupied} occupied, ${available} available, ` +
      `${outOfService} out of service. Occupancy ${this.occupancy()} percent of sellable rooms.`
    );
  });

  constructor() {
    // Re-point the charts whenever the inputs change. Each series is read
    // unconditionally so the effect keeps tracking all three even on its first
    // run, which happens before `ngAfterViewInit` has created any chart.
    effect(() => {
      const guests = this.guestSeries();
      const revenue = this.revenueSeries();
      const roomMix = this.roomMix();
      this.applySeries(guests, revenue, roomMix);
    });
  }

  public ngAfterViewInit(): void {
    // Initialize charts after view is ready
    setTimeout(() => {
      void this.initializeCharts();
    }, 100);
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    // Destroy chart instances
    this.guestsChart?.destroy();
    this.revenueChart?.destroy();
    this.roomMixChart?.destroy();
  }

  /** `2026-08-10` -> `Aug 10`, so a 20-day axis stays readable. */
  private static dayLabel(isoDate: string): string {
    const [, month, day] = isoDate.split('-');
    const monthName = new Date(Date.UTC(2000, Number(month) - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    return `${monthName} ${Number(day)}`;
  }

  /**
   * One daily series, described in a sentence: the window it covers, the range
   * it moves through, and where it ended up.
   */
  private static describeSeries(
    name: string,
    series: ISeries,
    format: (value: number) => string
  ): string {
    if (series.data.length === 0) {
      return `${name}. No data available.`;
    }

    const latest = series.data[series.data.length - 1];
    return [
      `${name}, ${series.labels[0]} to ${series.labels[series.labels.length - 1]}`,
      `ranging from ${format(Math.min(...series.data))} to ${format(Math.max(...series.data))}`,
      `most recently ${format(latest)}.`,
    ].join(', ');
  }

  private static toSeries(points: IHistoricalData[]): ISeries {
    return {
      labels: points.map((p) => ChartsSection.dayLabel(p.timestamp)),
      data: points.map((p) => p.value),
    };
  }

  /**
   * A few faint horizontals to read a value against and nothing else: the days
   * are named along the axis, so vertical rules only added ink between marks.
   * `precision: 0` keeps the ticks whole, or an empty series counts 0 to 1 in
   * tenths and the money axis prints `$0` six times.
   */
  private static gridScales(
    palette: IChartPalette,
    formatTick: (value: number | string) => string = (value) =>
      Number(value).toLocaleString('en-US')
  ): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: translucent(palette.border, 0.5), drawTicks: false },
          ticks: {
            color: palette.muted,
            padding: 8,
            precision: 0,
            maxTicksLimit: 5,
            callback: formatTick,
          },
        },
        x: {
          border: { color: palette.border },
          grid: { display: false },
          ticks: { color: palette.muted, maxRotation: 0, autoSkipPadding: 12 },
        },
      },
    };
  }

  private async initializeCharts(): Promise<void> {
    const palette = readPalette();
    await fontLoaded(palette.family);
    // The wait can outlast the route, and a second visit reuses these canvas
    // ids: building here would put two charts on one canvas, which throws.
    if (this.destroyed) {
      return;
    }

    // Every piece of chart text inherits this: ticks, legend and tooltips.
    Chart.defaults.font.family = palette.family;
    this.initializeGuestsChart(palette);
    this.initializeRevenueChart(palette);
    this.initializeRoomMixChart(palette);
  }

  private static canvasContext(id: string): CanvasRenderingContext2D | null {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    return canvas?.getContext('2d') ?? null;
  }

  /** Guests in house per night over the trailing window. */
  private initializeGuestsChart(palette: IChartPalette): void {
    const ctx = ChartsSection.canvasContext('guestsChart');
    if (!ctx) {
      return;
    }

    const series = this.guestSeries();
    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Guests in house',
            data: series.data,
            borderColor: palette.accent,
            backgroundColor: translucent(palette.accent, 0.1),
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: palette.accent,
            pointBorderColor: palette.surface,
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        ...ChartsSection.gridScales(palette),
        plugins: {
          // One series, already named by the card's title.
          legend: { display: false },
          tooltip: tooltipStyle(palette),
        },
      },
    };

    this.guestsChart = new Chart(ctx, config);
  }

  /** Room revenue recognised per night over the trailing window. */
  private initializeRevenueChart(palette: IChartPalette): void {
    const ctx = ChartsSection.canvasContext('revenueChart');
    if (!ctx) {
      return;
    }

    const series = this.revenueSeries();
    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Room revenue',
            data: series.data,
            backgroundColor: translucent(palette.accent, 0.75),
            borderColor: palette.accent,
            borderWidth: 1,
          },
        ],
      },
      options: {
        ...ChartsSection.gridScales(palette, dollars),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(palette),
            callbacks: {
              label: (context) => dollars(context.parsed.y ?? 0),
            },
          },
        },
      },
    };

    this.revenueChart = new Chart(ctx, config);
  }

  /** How tonight's physical inventory splits: sold, sellable, out of service. */
  private initializeRoomMixChart(palette: IChartPalette): void {
    const ctx = ChartsSection.canvasContext('roomMixChart');
    if (!ctx) {
      return;
    }

    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: ['Occupied', 'Available', 'Out of service'],
        datasets: [
          {
            data: this.roomMix(),
            // Sold in the accent, sellable in the page's ink, out of service
            // in the inactive fill. Chosen as a set: every pair stays at least
            // 0.15 apart in OKLab for each deficiency `cvd.ts` simulates. A
            // green for "available" was tried and came within 0.05 of the
            // accent; the legend names each slice regardless.
            backgroundColor: [palette.accent, palette.text, palette.inactive],
            borderColor: palette.surface,
            borderWidth: 2,
          },
        ],
      },
      plugins: [occupancyCentre(palette, () => this.occupancy())],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // A hole wide enough for the figure at 250px tall, the phone height.
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: palette.label, boxWidth: 12, padding: 15, font: { size: 12 } },
          },
          tooltip: {
            ...tooltipStyle(palette),
            callbacks: {
              label: (context) => `${context.label}: ${context.parsed} rooms`,
            },
          },
        },
      },
    };

    this.roomMixChart = new Chart(ctx, config);
  }

  /**
   * Draw what a chart now holds, at once and for good.
   *
   * `update('none')` alone is not enough. It writes the new geometry straight
   * onto the elements but leaves any running animation alone, and an animation
   * fixed its destination when it started. So an answer landing during the
   * 1000ms initial animation was overwritten on the next frame, and the chart
   * finished on the fixture it was built from, until the next poll 15s later.
   *
   * It looked like a phone bug and was not one: it followed whether the card is
   * a whole number of pixels wide. A fractional width (371.33px at 1440) can
   * never equal the integer `canvas.width`, so Chart.js's `retinaScale` reports
   * a change on every resize, and the `update('resize')` that follows the first
   * observer callback ends the initial animation. Those widths had nothing left
   * to overwrite the answer; 390, 1280 and 1442 did.
   */
  private static redraw(chart: Pick<Chart, 'stop' | 'update'>): void {
    chart.stop();
    chart.update('none'); // no animation — smoother under a 2s feed
  }

  /**
   * Re-point the charts at the current inputs. The series come from the API in
   * full, so we replace them rather than shifting a window by hand.
   */
  private applySeries(guests: ISeries, revenue: ISeries, roomMix: number[]): void {
    if (this.guestsChart) {
      this.guestsChart.data.labels = guests.labels;
      this.guestsChart.data.datasets[0].data = guests.data;
      ChartsSection.redraw(this.guestsChart);
    }

    if (this.revenueChart) {
      this.revenueChart.data.labels = revenue.labels;
      this.revenueChart.data.datasets[0].data = revenue.data;
      ChartsSection.redraw(this.revenueChart);
    }

    if (this.roomMixChart) {
      this.roomMixChart.data.datasets[0].data = roomMix;
      ChartsSection.redraw(this.roomMixChart);
    }
  }
}
