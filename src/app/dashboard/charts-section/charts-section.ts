import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  input,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { IHistoricalData, IMetrics } from '../../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../../services/offline-dashboard.fixture';

// Register Chart.js components
Chart.register(...registerables);

/** Palette shared by every chart, so the three read as one system. */
const BLOOD = '#9d2235';
/** Axis tick labels. Tracks --color-text-muted, raised to clear 4.5:1. */
const TEXT_MUTED = '#9a8a90';
const LABEL = '#b8a8ae';
const SURFACE = '#211d1f';
const AVAILABLE = '#6fa8d8';
/** A doughnut fill rather than text, so the 3:1 non-text floor applies — which
    the old muted grey already cleared. Left where it was. */
const OUT_OF_SERVICE = '#7a6a70';

/** Tooltip/scale styling repeated across all three configs. */
const TOOLTIP_STYLE = {
  backgroundColor: SURFACE,
  titleColor: '#e8dfe3',
  bodyColor: LABEL,
  borderColor: BLOOD,
  borderWidth: 1,
};

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
  private roomMixChart?: Chart;

  /** Guests in house per night, shaped for the line chart. */
  private readonly guestSeries = computed(() => ChartsSection.toSeries(this.historicalGuests()));

  /** Room revenue per night, shaped for the bar chart. */
  private readonly revenueSeries = computed(() => ChartsSection.toSeries(this.historicalRevenue()));

  /** How tonight's physical inventory splits: sold, sellable, out of service. */
  private readonly roomMix = computed(() => {
    const { occupiedRooms, availableRooms, totalRooms, operationalRooms } = this.metrics();
    return [occupiedRooms, availableRooms, Math.max(totalRooms - operationalRooms, 0)];
  });

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
    return `Room inventory tonight: ${occupied} occupied, ${available} available, ${outOfService} out of service.`;
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
      this.initializeCharts();
    }, 100);
  }

  public ngOnDestroy(): void {
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

  private static gridScales(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(58, 50, 54, 0.5)' },
          ticks: { color: TEXT_MUTED },
        },
        x: {
          grid: { color: 'rgba(58, 50, 54, 0.3)' },
          ticks: { color: TEXT_MUTED, maxRotation: 0, autoSkipPadding: 12 },
        },
      },
    };
  }

  private initializeCharts(): void {
    this.initializeGuestsChart();
    this.initializeRevenueChart();
    this.initializeRoomMixChart();
  }

  private static canvasContext(id: string): CanvasRenderingContext2D | null {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    return canvas?.getContext('2d') ?? null;
  }

  /** Guests in house per night over the trailing window. */
  private initializeGuestsChart(): void {
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
            borderColor: BLOOD,
            backgroundColor: 'rgba(157, 34, 53, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: BLOOD,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        ...ChartsSection.gridScales(),
        plugins: {
          legend: { display: true, labels: { color: LABEL, font: { size: 12 } } },
          tooltip: TOOLTIP_STYLE,
        },
      },
    };

    this.guestsChart = new Chart(ctx, config);
  }

  /** Room revenue recognised per night over the trailing window. */
  private initializeRevenueChart(): void {
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
            backgroundColor: 'rgba(157, 34, 53, 0.75)',
            borderColor: BLOOD,
            borderWidth: 1,
          },
        ],
      },
      options: {
        ...ChartsSection.gridScales(),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (context) =>
                `$${Number(context.parsed.y).toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}`,
            },
          },
        },
      },
    };

    this.revenueChart = new Chart(ctx, config);
  }

  /** How tonight's physical inventory splits: sold, sellable, out of service. */
  private initializeRoomMixChart(): void {
    const ctx = ChartsSection.canvasContext('roomMixChart');
    if (!ctx) {
      return;
    }

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: ['Occupied', 'Available', 'Out of service'],
        datasets: [
          {
            data: this.roomMix(),
            backgroundColor: [BLOOD, AVAILABLE, OUT_OF_SERVICE],
            borderColor: SURFACE,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: LABEL, padding: 15, font: { size: 11 } },
          },
          tooltip: {
            ...TOOLTIP_STYLE,
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
   * Re-point the charts at the current inputs. The series come from the API in
   * full, so we replace them rather than shifting a window by hand.
   */
  private applySeries(guests: ISeries, revenue: ISeries, roomMix: number[]): void {
    if (this.guestsChart) {
      this.guestsChart.data.labels = guests.labels;
      this.guestsChart.data.datasets[0].data = guests.data;
      this.guestsChart.update('none'); // no animation — smoother under a 2s feed
    }

    if (this.revenueChart) {
      this.revenueChart.data.labels = revenue.labels;
      this.revenueChart.data.datasets[0].data = revenue.data;
      this.revenueChart.update('none');
    }

    if (this.roomMixChart) {
      this.roomMixChart.data.datasets[0].data = roomMix;
      this.roomMixChart.update('none');
    }
  }
}
