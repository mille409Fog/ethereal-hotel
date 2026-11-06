import { formatNumber } from '@angular/common';

/**
 * The occupancy figure, one decimal place, no unit. Every place that states it
 * goes through here: the metric card, the spoken digest, the doughnut's centre
 * and the doughnut's text alternative.
 *
 * One function rather than one format string, because the obvious second
 * spelling rounds differently. `DecimalPipe` rounds the decimal digits and
 * `toFixed` rounds the binary value, so 84.35 is 84.4 to one and 84.3 to the
 * other, and a card and a chart side by side would disagree by a tenth. The
 * locale is fixed for the same reason the rest of the dashboard's copy is
 * English: a canvas cannot take a pipe, and this has to match wherever it lands.
 */
export function formatOccupancy(occupancy: number): string {
  return formatNumber(occupancy, 'en-US', '1.1-1');
}
