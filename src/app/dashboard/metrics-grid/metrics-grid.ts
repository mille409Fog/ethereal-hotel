import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IMetrics } from '../../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../../services/offline-dashboard.fixture';

@Component({
  selector: 'app-metrics-grid',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './metrics-grid.html',
  styleUrl: './metrics-grid.css',
})
export class MetricsGrid {
  @Input() metrics: IMetrics = OFFLINE_DASHBOARD.metrics;

  /**
   * Rooms held back for maintenance — physical inventory that is not sellable
   * tonight, and therefore excluded from the occupancy denominator.
   */
  get outOfServiceRooms(): number {
    return Math.max(this.metrics.totalRooms - this.metrics.operationalRooms, 0);
  }

  /**
   * Net movement across the front desk today. Positive means the house fills.
   */
  get netRoomsMovement(): number {
    return this.metrics.arrivalsToday - this.metrics.departuresToday;
  }
}
