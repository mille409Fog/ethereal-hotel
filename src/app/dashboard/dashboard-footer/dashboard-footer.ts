import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BackendStatus, POLL_INTERVAL_SECONDS } from '../../services/dashboard-api.service';

@Component({
  selector: 'app-dashboard-footer',
  imports: [],
  templateUrl: './dashboard-footer.html',
  styleUrl: './dashboard-footer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardFooter {
  public readonly status = input<BackendStatus>('checking');

  /**
   * How the figures on the page reached it, following the same status as the
   * header's badge so the two cannot disagree.
   *
   * The socket's line names no interval because the backend owns that number;
   * see {@link POLL_INTERVAL_SECONDS}. While the health check is in flight the
   * transport is not yet known, so nothing is claimed.
   */
  public readonly transportNote = computed(() => {
    switch (this.status()) {
      case 'connected':
        return 'Streamed over a WebSocket';
      case 'polling':
        return `Polled over REST every ${POLL_INTERVAL_SECONDS} seconds`;
      case 'disconnected':
        return 'Committed snapshot, not updating';
      default:
        return null;
    }
  });
}
