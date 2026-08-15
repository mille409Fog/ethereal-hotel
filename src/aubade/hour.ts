/**
 * The hour, for whichever of AUBADE's routes is asking.
 *
 * There are two of them now — the lobby and the Reader's Edition — and both have
 * to answer the same question the same way: what is the sun doing where this
 * person is, and has a developer asked us to pretend otherwise? Two routes
 * asking it separately is two copies of the answer, and one of those copies is a
 * security-shaped thing rather than a cosmetic one.
 *
 * That is the whole reason this file exists. `?t=` hands its caller the entire
 * work from the address bar, and AUBADE's position is that the refusal is the
 * concept: the only door into the night rooms in production is the invitation.
 * So the gate on that back door is written once, here, and `check:docs` fails if
 * any file in `src/aubade/` reads the fake clock without it. A second route that
 * forgot the `isDevMode()` call would look completely fine, pass every test, and
 * quietly give the piece away.
 *
 * Nothing here is stateful and nothing here schedules anything. Both routes
 * re-read the sun on a timer, because the piece's ending is a visitor sitting
 * through their own sunrise and a page that read the sun once would simply fail
 * to have one — but a ticker is three lines of wiring and belongs with the thing
 * it is wired to. What is shared is the rule, not the plumbing.
 */

import { isDevMode } from '@angular/core';
import { parseFakeClock, type IFakeClock } from './fake-clock';
import { readClock, type IAubadeClock } from './solar';
import type { AubadeState } from './solar/state';

/**
 * How often a route should re-read the sun.
 *
 * Far finer than the five states need — the narrowest of them lasts about half
 * an hour at a temperate latitude — and that is not the point. It is arithmetic,
 * it touches no network and no GPU, and it is what lets the hotel close under a
 * visitor who is still sitting in it at dawn.
 */
export const SUN_INTERVAL_MS = 60_000;

/**
 * `location.search`, or nothing at all.
 *
 * Guarded because callers read this in field initialisers, which run before any
 * view exists, and because a route rendered outside a browser has no `location`.
 */
function search(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

/** What `?t=` asked for — in development. `null` in production, always. */
function asked(): IFakeClock | null {
  return isDevMode() ? parseFakeClock(search()) : null;
}

/**
 * A state forced by the dev-only `?t=`, or `null`.
 *
 * Read once, into a field, rather than called from a `computed`: the back door
 * is a fixture for whoever is building the thing, and a fixture that could
 * change under a running page is a worse debugging instrument than one that
 * cannot.
 *
 * @returns One of the five states when a developer named one, `null` otherwise
 *   and in production.
 */
export function forcedState(): AubadeState | null {
  return asked()?.state ?? null;
}

/**
 * Read the sun where this visitor is.
 *
 * @returns A complete reading — location, elevation, state, and the next
 *   crossing in each direction. Honours `?t=` and `?tz=` in development; in
 *   production it is `readClock(new Date())` and nothing else.
 */
export function readTheSun(): IAubadeClock {
  const wanted = asked();
  return readClock(wanted?.at ?? new Date(), wanted?.zone ?? undefined);
}
