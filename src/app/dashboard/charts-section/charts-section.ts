import {
  Component,
  AfterViewInit,
  OnDestroy,
  Input,
  SimpleChanges,
  OnChanges,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-charts-section',
  imports: [],
  templateUrl: './charts-section.html',
  styleUrl: './charts-section.css',
})
export class ChartsSection implements AfterViewInit, OnDestroy, OnChanges {
  @Input() metrics = {
    activeUsers: 0,
    revenue: 0,
    requests: 0,
    uptime: 0,
  };

  private trafficChart?: Chart;
  private performanceChart?: Chart;
  private distributionChart?: Chart;

  ngAfterViewInit(): void {
    // Initialize charts after view is ready
    setTimeout(() => {
      this.initializeCharts();
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['metrics'] && !changes['metrics'].firstChange) {
      this.updateCharts();
    }
  }

  ngOnDestroy(): void {
    // Destroy chart instances
    this.trafficChart?.destroy();
    this.performanceChart?.destroy();
    this.distributionChart?.destroy();
  }

  private initializeCharts(): void {
    this.initializeTrafficChart();
    this.initializePerformanceChart();
    this.initializeDistributionChart();
  }

  private initializeTrafficChart(): void {
    const canvas = document.getElementById('trafficChart') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Generate initial data for last 12 hours
    const labels: string[] = [];
    const data: number[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      labels.push(`${time.getHours().toString().padStart(2, '0')}:00`);
      data.push(Math.floor(Math.random() * 1000) + 500);
    }

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Active Users',
            data,
            borderColor: '#9d2235',
            backgroundColor: 'rgba(157, 34, 53, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#9d2235',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#b8a8ae',
              font: { size: 12 },
            },
          },
          tooltip: {
            backgroundColor: '#211d1f',
            titleColor: '#e8dfe3',
            bodyColor: '#b8a8ae',
            borderColor: '#9d2235',
            borderWidth: 1,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(58, 50, 54, 0.5)',
            },
            ticks: {
              color: '#7a6a70',
            },
          },
          x: {
            grid: {
              color: 'rgba(58, 50, 54, 0.3)',
            },
            ticks: {
              color: '#7a6a70',
            },
          },
        },
      },
    };

    this.trafficChart = new Chart(ctx, config);
  }

  private initializePerformanceChart(): void {
    const canvas = document.getElementById('performanceChart') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: ['API Response', 'Database Query', 'Cache Hit', 'External API', 'Processing'],
        datasets: [
          {
            label: 'Response Time (ms)',
            data: [45, 120, 12, 230, 85],
            backgroundColor: [
              'rgba(157, 34, 53, 0.8)',
              'rgba(157, 34, 53, 0.7)',
              'rgba(111, 184, 128, 0.8)',
              'rgba(157, 34, 53, 0.6)',
              'rgba(157, 34, 53, 0.75)',
            ],
            borderColor: '#9d2235',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: '#211d1f',
            titleColor: '#e8dfe3',
            bodyColor: '#b8a8ae',
            borderColor: '#9d2235',
            borderWidth: 1,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(58, 50, 54, 0.5)',
            },
            ticks: {
              color: '#7a6a70',
            },
          },
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: '#7a6a70',
              font: { size: 10 },
            },
          },
        },
      },
    };

    this.performanceChart = new Chart(ctx, config);
  }

  private initializeDistributionChart(): void {
    const canvas = document.getElementById('distributionChart') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        datasets: [
          {
            data: [45, 28, 15, 8, 4],
            backgroundColor: [
              'rgba(157, 34, 53, 0.9)',
              'rgba(157, 34, 53, 0.7)',
              'rgba(157, 34, 53, 0.5)',
              'rgba(111, 168, 216, 0.7)',
              'rgba(122, 106, 112, 0.7)',
            ],
            borderColor: '#211d1f',
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
            labels: {
              color: '#b8a8ae',
              padding: 15,
              font: { size: 11 },
            },
          },
          tooltip: {
            backgroundColor: '#211d1f',
            titleColor: '#e8dfe3',
            bodyColor: '#b8a8ae',
            borderColor: '#9d2235',
            borderWidth: 1,
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                return `${label}: ${value}%`;
              },
            },
          },
        },
      },
    };

    this.distributionChart = new Chart(ctx, config);
  }

  private updateCharts(): void {
    // Update traffic chart with new data point
    if (this.trafficChart && this.trafficChart.data.datasets[0].data) {
      const data = this.trafficChart.data.datasets[0].data as number[];

      // Remove first point and add new one
      data.shift();
      data.push(this.metrics.activeUsers);

      // Update labels
      const now = new Date();
      this.trafficChart.data.labels?.shift();
      this.trafficChart.data.labels?.push(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      );

      this.trafficChart.update('none'); // Update without animation for smoother real-time feel
    }
  }
}
