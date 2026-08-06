import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-metrics-grid',
  imports: [],
  templateUrl: './metrics-grid.html',
  styleUrl: './metrics-grid.css',
})
export class MetricsGrid {
  @Input() metrics = {
    activeUsers: 0,
    revenue: 0,
    requests: 0,
    uptime: 0
  };

  // Expose Math for template
  Math = Math;
}
