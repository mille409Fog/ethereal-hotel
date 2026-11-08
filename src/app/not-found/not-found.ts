import { ChangeDetectionStrategy, Component, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/**
 * What any path the router does not know renders, from the `**` route at the
 * end of `app.routes.ts`.
 *
 * Before it existed an unknown path did not fall back to anything. The router
 * threw NG04002 on the first navigation, put the address bar back to `/` and
 * activated no route, so the visitor saw a blank page under a URL that claimed
 * to be the home page. A truncated link pasted into a message is an ordinary
 * way to arrive at a site sent to reviewers, so that blank page was the first
 * impression for some of them.
 *
 * The URL is left as typed: the route renders in place rather than
 * redirecting, and the page repeats the path back so the visitor can see the
 * typo. Interpolation escapes it, so a path cannot inject markup.
 *
 * The path is read from the route's `url` stream rather than once at
 * construction. Two unknown paths share one route config, so the router reuses
 * this component between them, and a value read once would name the first.
 * The site's links are plain `href`s, so that only happens through
 * `router.navigate`, but a page that names the wrong path would be worse than
 * one that names none.
 *
 * Owns a `main` landmark, like every route that renders nothing else.
 */
@Component({
  selector: 'app-not-found',
  imports: [],
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {
  public readonly path: Signal<string> = toSignal(
    inject(ActivatedRoute).url.pipe(
      map((segments) => `/${segments.map((segment) => segment.path).join('/')}`)
    ),
    { requireSync: true }
  );
}
