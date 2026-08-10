import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IMetrics } from '../../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../../services/offline-dashboard.fixture';

@Component({
  selector: 'app-metrics-grid',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './metrics-grid.html',
  styleUrl: './metrics-grid.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricsGrid {
  public readonly metrics = input<IMetrics>(OFFLINE_DASHBOARD.metrics);

  /**
   * Rooms held back for maintenance — physical inventory that is not sellable
   * tonight, and therefore excluded from the occupancy denominator.
   */
  public readonly outOfServiceRooms = computed(() => {
    const { totalRooms, operationalRooms } = this.metrics();
    return Math.max(totalRooms - operationalRooms, 0);
  });

  /**
   * Net movement across the front desk today. Positive means the house fills.
   */
  public readonly netRoomsMovement = computed(() => {
    const { arrivalsToday, departuresToday } = this.metrics();
    return arrivalsToday - departuresToday;
  });
}
