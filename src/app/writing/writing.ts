import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ILogEntry, MURMURATION_LOG } from './writing.data';

/**
 * `/writing` — one section, MURMURATION_LOG.
 *
 * A route rather than a homepage section for the reason `/work` is one: long
 * form wants its own title, its own URL and its own social card. Like `/work`
 * it owns a `main` landmark, since it is the only thing the route renders.
 *
 * The entries live in `writing.data.ts`; see that file for how to add one.
 */
@Component({
  selector: 'app-writing',
  templateUrl: './writing.html',
  styleUrl: './writing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Writing {
  /**
   * The log. An input only so the spec can render entries while the real log
   * is still empty; the router never sets it, so the page always shows
   * `MURMURATION_LOG`.
   */
  public readonly entries = input<readonly ILogEntry[]>(MURMURATION_LOG);

  /**
   * Whether the log has anything in it yet. Compiled in, so this is never a
   * loading state — only "not written yet", which the page says plainly.
   */
  public readonly isEmpty = computed((): boolean => this.entries().length === 0);
}
