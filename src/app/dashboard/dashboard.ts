import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly dashboardApi = inject(DashboardApiService);
  private readonly destroyRef = inject(DestroyRef);

  // Flag to toggle between the committed fixture and the real backend
  private useBackend = false;

  public readonly backendStatus = signal<BackendStatus>('checking');

  // Seeded from the committed snapshot so the grid never renders zeroes while
  // the health check is in flight. Replaced wholesale once the backend answers.
  public readonly metrics = signal<IMetrics>(OFFLINE_DASHBOARD.metrics);
  public readonly historicalGuests = signal<IHistoricalData[]>(OFFLINE_DASHBOARD.historicalGuests);
  public readonly historicalRevenue = signal<IHistoricalData[]>(
    OFFLINE_DASHBOARD.historicalRevenue
  );

  public async ngOnInit(): Promise<void> {
    if (!(await this.dashboardApi.checkBackendHealth())) {
      this.useOfflineFixture();
      return;
    }

    this.useBackend = true;
    this.backendStatus.set('connected');

    // One REST read for the historical series the charts need, then the socket
    // takes over for the live snapshot.
    try {
      const dashboard = await this.dashboardApi.getDashboard();
      this.metrics.set(dashboard.metrics);
      this.historicalGuests.set(dashboard.historicalGuests);
      this.historicalRevenue.set(dashboard.historicalRevenue);
    } catch {
      // The health check passed but this read didn't. Keep the fixture history
      // and let the socket drive the live numbers rather than blanking the page.
      this.historicalGuests.set(OFFLINE_DASHBOARD.historicalGuests);
      this.historicalRevenue.set(OFFLINE_DASHBOARD.historicalRevenue);
    }

    this.startRealTimeUpdatesFromBackend();
  }

  public ngOnDestroy(): void {
    if (this.useBackend) {
      this.dashboardApi.disconnectWebSocket();
    }
  }

  /**
   * Connect to backend WebSocket for real-time updates.
   *
   * `takeUntilDestroyed` takes an explicit `DestroyRef` because this runs from
   * `ngOnInit`, outside the injection context its no-argument form requires.
   */
  private startRealTimeUpdatesFromBackend(): void {
    this.dashboardApi
      .connectWebSocket()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (metrics: IMetrics) => {
          this.metrics.set(metrics);
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
    this.backendStatus.set('disconnected');
    this.metrics.set(OFFLINE_DASHBOARD.metrics);
    this.historicalGuests.set(OFFLINE_DASHBOARD.historicalGuests);
    this.historicalRevenue.set(OFFLINE_DASHBOARD.historicalRevenue);
  }
}
