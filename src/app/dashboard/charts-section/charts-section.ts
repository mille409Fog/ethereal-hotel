import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { IHistoricalData, IMetrics } from '../../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../../services/offline-dashboard.fixture';

// Register Chart.js components
Chart.register(...registerables);

/** Palette shared by every chart, so the three read as one system. */
const BLOOD = '#9d2235';
const TEXT_MUTED = '#7a6a70';
const LABEL = '#b8a8ae';
const SURFACE = '#211d1f';
const AVAILABLE = '#6fa8d8';
const OUT_OF_SERVICE = '#7a6a70';

/** Tooltip/scale styling repeated across all three configs. */
const TOOLTIP_STYLE = {
  backgroundColor: SURFACE,
  titleColor: '#e8dfe3',
  bodyColor: LABEL,
  borderColor: BLOOD,
  borderWidth: 1,
};

@Component({
  selector: 'app-charts-section',
  imports: [],
  templateUrl: './charts-section.html',
  styleUrl: './charts-section.css',
})
export class ChartsSection implements AfterViewInit, OnDestroy, OnChanges {
  @Input() metrics: IMetrics = OFFLINE_DASHBOARD.metrics;
  @Input() historicalGuests: IHistoricalData[] = OFFLINE_DASHBOARD.historicalGuests;
  @Input() historicalRevenue: IHistoricalData[] = OFFLINE_DASHBOARD.historicalRevenue;

  private guestsChart?: Chart;
  private revenueChart?: Chart;
  private roomMixChart?: Chart;

  ngAfterViewInit(): void {
    // Initialize charts after view is ready
    setTimeout(() => {
      this.initializeCharts();
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const firstRender = Object.values(changes).every((change) => change.firstChange);
    if (!firstRender) {
      this.updateCharts();
    }
  }

  ngOnDestroy(): void {
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
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: this.historicalGuests.map((p) => ChartsSection.dayLabel(p.timestamp)),
        datasets: [
          {
            label: 'Guests in house',
            data: this.historicalGuests.map((p) => p.value),
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
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.historicalRevenue.map((p) => ChartsSection.dayLabel(p.timestamp)),
        datasets: [
          {
            label: 'Room revenue',
            data: this.historicalRevenue.map((p) => p.value),
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
    if (!ctx) return;

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

  private roomMix(): number[] {
    const { occupiedRooms, availableRooms, totalRooms, operationalRooms } = this.metrics;
    return [occupiedRooms, availableRooms, Math.max(totalRooms - operationalRooms, 0)];
  }

  /**
   * Re-point the charts at the current inputs. The series come from the API in
   * full, so we replace them rather than shifting a window by hand.
   */
  private updateCharts(): void {
    if (this.guestsChart) {
      this.guestsChart.data.labels = this.historicalGuests.map((p) =>
        ChartsSection.dayLabel(p.timestamp)
      );
      this.guestsChart.data.datasets[0].data = this.historicalGuests.map((p) => p.value);
      this.guestsChart.update('none'); // no animation — smoother under a 2s feed
    }

    if (this.revenueChart) {
      this.revenueChart.data.labels = this.historicalRevenue.map((p) =>
        ChartsSection.dayLabel(p.timestamp)
      );
      this.revenueChart.data.datasets[0].data = this.historicalRevenue.map((p) => p.value);
      this.revenueChart.update('none');
    }

    if (this.roomMixChart) {
      this.roomMixChart.data.datasets[0].data = this.roomMix();
      this.roomMixChart.update('none');
    }
  }
}
