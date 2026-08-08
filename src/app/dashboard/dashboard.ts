import { Component, OnDestroy, OnInit } from '@angular/core';
import { interval, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { DashboardApiService } from '../services/dashboard-api.service';
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

  // Flag to toggle between mock data and real backend
  private useBackend = false;
  backendStatus: 'checking' | 'connected' | 'disconnected' = 'checking';

  // Real-time metrics
  metrics = {
    activeUsers: 1247,
    revenue: 18500,
    requests: 687,
    uptime: 99.92,
  };

  constructor(private dashboardApi: DashboardApiService) {}

  async ngOnInit(): Promise<void> {
    // Check if backend is available
    const backendAvailable = await this.dashboardApi.checkBackendHealth();

    if (backendAvailable) {
      this.useBackend = true;
      this.backendStatus = 'connected';
      console.log('✅ Using real backend data');
      this.startRealTimeUpdatesFromBackend();
    } else {
      this.backendStatus = 'disconnected';
      console.log('⚠️  Backend not available, using mock data');
      this.startMockUpdates();
    }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        next: (data: any) => {
          this.metrics = {
            activeUsers: data.activeUsers,
            revenue: data.revenue,
            requests: data.requests,
            uptime: data.uptime,
          };
        },
        error: (error) => {
          console.error('WebSocket error, falling back to mock data:', error);
          this.backendStatus = 'disconnected';
          this.startMockUpdates();
        },
      });
  }

  /**
   * Fallback: Generate mock data locally (original behavior)
   */
  private startMockUpdates(): void {
    interval(2000)
      .pipe(
        takeUntil(this.destroy$),
        map(() => ({
          activeUsers: Math.floor(Math.random() * 500) + 800,
          revenue: Math.floor(Math.random() * 5000) + 15000,
          requests: Math.floor(Math.random() * 200) + 500,
          uptime: 99.8 + Math.random() * 0.2,
        }))
      )
      .subscribe((data) => {
        this.metrics = data;
      });
  }
}
