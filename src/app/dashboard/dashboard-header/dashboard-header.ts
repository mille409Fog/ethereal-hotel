import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BackendStatus } from '../../services/dashboard-api.service';

@Component({
  selector: 'app-dashboard-header',
  imports: [],
  templateUrl: './dashboard-header.html',
  styleUrl: './dashboard-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardHeader {
  public readonly status = input<BackendStatus>('checking');

  /**
   * The provenance badge, phrased for a listener rather than a reader.
   *
   * On screen the badge leans on a coloured dot and a `·` separator to carry
   * the distinction between live and simulated data; spoken aloud, neither
   * survives. This says it in words instead, and lives in a `role="status"`
   * region so a user who is somewhere else on the page still finds out when the
   * backend drops and the numbers stop being real.
   */
  public readonly statusAnnouncement = computed(() => {
    switch (this.status()) {
      case 'connected':
        return 'Connected to the API. Hotel metrics are now updating live.';
      case 'disconnected':
        return 'The API is unreachable. The figures shown are simulated — a committed snapshot of a seeded database, not live data.';
      default:
        return 'Connecting to the API.';
    }
  });
}
