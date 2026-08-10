import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  BackendStatus,
  DashboardApiService,
  IHistoricalData,
  IMetrics,
} from '../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../services/offline-dashboard.fixture';
import { ChartsSection } from './charts-section/charts-section';
import { DashboardFooter } from './dashboard-footer/dashboard-footer';
import { DashboardHeader } from './dashboard-header/dashboard-header';
import { MetricsGrid } from './metrics-grid/metrics-grid';

@Component({
  selector: 'app-dashboard',
  imports: [DashboardHeader, MetricsGrid, ChartsSection, DashboardFooter],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Flag to toggle between the committed fixture and the real backend
  private useBackend = false;
  backendStatus: BackendStatus = 'checking';

  // Seeded from the committed snapshot so the grid never renders zeroes while
  // the health check is in flight. Replaced wholesale once the backend answers.
  metrics: IMetrics = OFFLINE_DASHBOARD.metrics;
  historicalGuests: IHistoricalData[] = OFFLINE_DASHBOARD.historicalGuests;
  historicalRevenue: IHistoricalData[] = OFFLINE_DASHBOARD.historicalRevenue;

  constructor(private dashboardApi: DashboardApiService) {}

  async ngOnInit(): Promise<void> {
    if (!(await this.dashboardApi.checkBackendHealth())) {
      this.useOfflineFixture();
      return;
    }

    this.useBackend = true;
    this.backendStatus = 'connected';

    // One REST read for the historical series the charts need, then the socket
    // takes over for the live snapshot.
    try {
      const dashboard = await this.dashboardApi.getDashboard();
      this.metrics = dashboard.metrics;
      this.historicalGuests = dashboard.historicalGuests;
      this.historicalRevenue = dashboard.historicalRevenue;
    } catch {
      // The health check passed but this read didn't. Keep the fixture history
      // and let the socket drive the live numbers rather than blanking the page.
      this.historicalGuests = OFFLINE_DASHBOARD.historicalGuests;
      this.historicalRevenue = OFFLINE_DASHBOARD.historicalRevenue;
    }

    this.startRealTimeUpdatesFromBackend();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.useBackend) {
      this.dashboardApi.disconnectWebSocket();
    }
  }

  /**
   * Connect to backend WebSocket for real-time updates
   */
  private startRealTimeUpdatesFromBackend(): void {
    this.dashboardApi
      .connectWebSocket()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics: IMetrics) => {
          this.metrics = metrics;
        },
        error: () => {
          this.useOfflineFixture();
        },
      });
  }

  /**
   * Fall back to the committed snapshot of a real seeded backend.
   *
   * Deliberately *not* a generator: the previous implementation invented
   * numbers with `Math.random()` every two seconds, which contradicted the
   * README's claim that every value is derived from real records. A recording
   * is honest — it just has to say so, which the header badge does.
   */
  private useOfflineFixture(): void {
    this.backendStatus = 'disconnected';
    this.metrics = OFFLINE_DASHBOARD.metrics;
    this.historicalGuests = OFFLINE_DASHBOARD.historicalGuests;
    this.historicalRevenue = OFFLINE_DASHBOARD.historicalRevenue;
  }
}
