import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
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
  /**
   * How often the live region is allowed to speak.
   *
   * The socket pushes a fresh snapshot every 2 seconds. Putting `aria-live` on
   * the grid itself — the obvious reading of "announce the metrics" — would
   * therefore queue six cards of speech every 2 seconds, and a polite region
   * only ever appends: the user would fall further behind the announcements the
   * longer the page stayed open, unable to hear anything else on the page.
   * That is louder than silence, not better than it.
   *
   * So the grid is not a live region. This one throttled digest is, and 30s is
   * roughly the shortest gap at which a full sentence still finishes with room
   * to think before the next one starts.
   */
  private static readonly ANNOUNCE_INTERVAL_MS = 30_000;

  private readonly destroyRef = inject(DestroyRef);

  public readonly metrics = input<IMetrics>(OFFLINE_DASHBOARD.metrics);

  /**
   * What the live region currently says. Empty until the first interval fires,
   * so the page does not talk over its own load.
   */
  public readonly announcement = signal('');

  constructor() {
    const timer = setInterval(() => {
      // Writing an identical string is a no-op on a signal, so a dashboard
      // sitting on the unchanging offline fixture announces once and then goes
      // quiet, rather than repeating itself every 30 seconds.
      this.announcement.set(this.digest());
    }, MetricsGrid.ANNOUNCE_INTERVAL_MS);

    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

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

  /**
   * The headline numbers as one spoken sentence.
   *
   * Written to be *heard*, which is a different job from the grid: the
   * abbreviations on screen are expanded ("ADR" is read as three letters by
   * most screen readers), the percentage is rounded to the precision a listener
   * can hold, and the figures are ordered the way a duty manager would ask for
   * them rather than the way they are laid out.
   */
  private digest(): string {
    const { occupancy, occupiedRooms, operationalRooms, adr, arrivalsToday, departuresToday } =
      this.metrics();

    return [
      `Occupancy ${occupancy.toFixed(1)} percent`,
      `${occupiedRooms} of ${operationalRooms} sellable rooms occupied`,
      `average daily rate ${Math.round(adr)} dollars`,
      `${arrivalsToday} arrivals and ${departuresToday} departures today`,
    ].join('. ');
  }
}
