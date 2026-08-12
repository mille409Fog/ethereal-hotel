import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CASE_STUDIES, ICaseStudy } from './work.data';

/**
 * `/work` — the proprietary engagements, told as decisions rather than as
 * technology lists.
 *
 * A route rather than a homepage section because these are the long-form
 * artefact on the site: 300 words each want a page with its own title and its
 * own shareable URL, not a band between two scroll-reveal sections. It follows
 * `/dashboard` and `/booking` in owning a `main` landmark, since it is the only
 * thing the route renders.
 *
 * The content lives in `work.data.ts` and is deliberately not inlined here —
 * see that file for why the skeleton is a type.
 */
@Component({
  selector: 'app-work',
  templateUrl: './work.html',
  styleUrl: './work.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Work {
  public readonly studies: readonly ICaseStudy[] = CASE_STUDIES;

  /**
   * Whether there is anything to show.
   *
   * Not a loading state and not an error: the studies are compiled in, so this
   * is only ever "not written yet". It is rendered as a plain sentence saying
   * exactly that, which is the honest thing for a page whose subject is
   * declining to invent detail.
   */
  public readonly isEmpty: boolean = CASE_STUDIES.length === 0;
}
