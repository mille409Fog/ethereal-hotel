import { Injectable } from '@angular/core';

/**
 * Vercel Web Analytics, behind one seam.
 *
 * **Why there is no `@vercel/analytics` dependency.** The package is the
 * obvious way to do this and it does not install here: it declares optional
 * peers on every framework it supports, and npm resolves `@sveltejs/kit`
 * anyway, which drags in Vite 8 against the Vite 7 that `@angular/build` pins.
 * The only fixes npm offers are `--force` and `--legacy-peer-deps`, and both
 * are `.npmrc` settings that would apply to *every* install in this repo
 * including CI's `npm ci` — a permanently weakened dependency resolver in
 * exchange for the twenty lines below. For a framework the package has no
 * adapter for, those twenty lines are all it would have given us: outside
 * React and Next it is a wrapper over the same `window.va` queue this file
 * talks to.
 *
 * **What the script is.** `/_vercel/insights/script.js` is served by the
 * deployment itself, not by a third party — same origin, no cookies, no
 * `localStorage`, nothing for an ad blocker to match a hostname on. It is
 * loaded from `index.html`; see `docs/analytics.md` for what it collects and,
 * more to the point, what it does not.
 *
 * **When the script is not there** — local `ng serve`, the Playwright run, a
 * reader with JavaScript restrictions, any deployment that is not Vercel — the
 * calls below land in `window.vaq` and stay there. That is the intended
 * degradation and it is also how you verify wiring without a deploy: fire the
 * event locally and read the queue in the console. Nothing here throws, retries
 * or reports, because analytics failing is not a thing the visitor should ever
 * be made to care about.
 */

/**
 * The three things worth knowing, per ROADMAP item 10.
 *
 * A closed set rather than free strings. Vercel's dashboard groups by exact
 * name, so `case_study_read` and `caseStudyRead` would silently become two
 * metrics that each undercount — the kind of error that looks like data.
 */
export const ANALYTICS_EVENTS = {
  /** `/dashboard` was opened — the route carrying the read-path argument. */
  dashboardReached: 'dashboard_reached',
  /** A case study was read to the end, as opposed to scrolled past. */
  caseStudyRead: 'case_study_read',
  /** The resume PDF was downloaded. */
  resumeDownloaded: 'resume_downloaded',
} as const;

/** One of {@link ANALYTICS_EVENTS}. */
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Properties attached to an event.
 *
 * Deliberately narrow. Vercel accepts scalars only, and the narrowness is also
 * the privacy boundary: there is no shape here that can carry a free-text
 * field, a URL with a query string, or anything else a visitor typed. What
 * this repo sends is enumerable and enumerated in `docs/analytics.md`.
 */
export type AnalyticsProperties = Record<string, string | number | boolean | null>;

/** The queue function Vercel's script installs, and that we shim before it. */
type VercelAnalytics = (
  command: 'event',
  payload: { name: string; data?: AnalyticsProperties }
) => void;

declare global {
  // The naming rule wants an `I` prefix on interfaces. This one is an
  // augmentation of the DOM's `Window`, so its name is not ours to choose —
  // `IWindow` would declare an unrelated interface and leave `window.va`
  // untyped.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    va?: VercelAnalytics;
    /** Calls made before the script loaded. Drained by it when it does. */
    vaq?: unknown[][];
  }
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  /**
   * Record that something worth knowing happened.
   *
   * @param event One of the three names in {@link ANALYTICS_EVENTS}.
   * @param properties Optional scalar detail — see {@link AnalyticsProperties}
   *   for why the type is as tight as it is.
   */
  public track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    this.queue()('event', { name: event, data: properties });
  }

  /**
   * `window.va`, creating the buffering shim if the script has not loaded.
   *
   * This is the snippet Vercel's own package inlines. It matters because the
   * script is `defer`red: an event fired during bootstrap — `dashboard_reached`
   * is, on a cold load of `/dashboard` — would otherwise be dropped for the
   * same reason it is the most interesting event to have.
   */
  private queue(): VercelAnalytics {
    window.va ??= (...args: unknown[]): void => {
      (window.vaq ??= []).push(args);
    };
    return window.va;
  }
}
