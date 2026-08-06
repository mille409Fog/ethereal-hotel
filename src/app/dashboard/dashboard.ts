import { Component, OnInit, OnDestroy } from '@angular/core';
import { interval, Subject } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { DashboardHeader } from './dashboard-header/dashboard-header';
import { MetricsGrid } from './metrics-grid/metrics-grid';
import { ChartsSection } from './charts-section/charts-section';
import { DashboardFooter } from './dashboard-footer/dashboard-footer';

@Component({
  selector: 'app-dashboard',
  imports: [
    DashboardHeader,
    MetricsGrid,
    ChartsSection,
    DashboardFooter
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  // Real-time metrics
  metrics = {
    activeUsers: 1247,
    revenue: 18500,
    requests: 687,
    uptime: 99.92
  };

  ngOnInit(): void {
    this.startRealTimeUpdates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private startRealTimeUpdates(): void {
    // Simulate real-time data updates every 2 seconds
    interval(2000)
      .pipe(
        takeUntil(this.destroy$),
        map(() => ({
          activeUsers: Math.floor(Math.random() * 500) + 800,
          revenue: Math.floor(Math.random() * 5000) + 15000,
          requests: Math.floor(Math.random() * 200) + 500,
          uptime: 99.8 + Math.random() * 0.2
        }))
      )
      .subscribe(data => {
        this.metrics = data;
      });
  }
}
