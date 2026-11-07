import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The way back to the portfolio from a route a project card opened.
 *
 * Every route except `/` renders nothing but its own component — there is no
 * shell around the router outlet — so before this existed a visitor who
 * followed a card reached a page with no way out but the browser's Back
 * button. One component for every route rather than a link per template, so
 * its wording, its tap target and its place on the first screen are decided
 * once.
 *
 * Two shapes. By default it is a bar above the page's `main`, padded like the
 * home page's nav so the name sits where it sat there. `floating` is for
 * `/murmuration`, whose canvas is the whole viewport: the bar would push the
 * canvas down by its own height and the page would scroll, so the link sits
 * over a corner of the picture instead and takes nothing from it.
 *
 * A plain `href`, not `routerLink`, like every other internal link on the
 * site: it works before the app boots, on middle click and on copy-link, and
 * the component needs no router to test.
 *
 * Not used on `/aubade` or `/aubade/reader`. That work shares this deployment
 * and nothing else, and its own doors are part of it.
 */
@Component({
  selector: 'app-home-link',
  imports: [],
  templateUrl: './home-link.html',
  styleUrl: './home-link.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.floating]': 'floating()' },
})
export class HomeLink {
  public readonly floating = input(false);
}
