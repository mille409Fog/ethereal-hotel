import { forcedState, readTheSun, SUN_INTERVAL_MS } from './hour';

/**
 * The hour, shared by the lobby and the Reader's Edition.
 *
 * Both routes read the sun through this file, and the reason it is one file is
 * the back door: `?t=` hands its caller the whole work, and the `isDevMode()`
 * gate on it has to exist in exactly one place or it will eventually exist in
 * only one of two. `check:docs` asserts the structural half of that — no file in
 * `src/aubade/` may touch the fake clock without the gate — and what is left for
 * a test is that the thing behind the gate actually works: a named state is
 * honoured, a real instant is honoured, and an unparseable one is ignored rather
 * than thrown on.
 *
 * These run in dev mode because Vitest never calls `enableProdMode()`, which is
 * the same reason `aubade.spec.ts` can drive `?t=` at all. The production
 * behaviour is not testable from here and is not tested here; it is a structural
 * claim, and `check:docs` is where structural claims are checked.
 */

describe('the hour', () => {
  /** Put the visitor somewhere in the query string. */
  const ask = (query: string): void => {
    window.history.replaceState({}, '', `/aubade${query}`);
  };

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  describe('what the developer asked for', () => {
    it('forces a named state', () => {
      ask('?t=warning');
      expect(forcedState()).toBe('warning');
    });

    it('forces nothing when nothing was asked', () => {
      ask('');
      expect(forcedState()).toBeNull();
    });

    it('forces nothing for an instant, because an instant is not a pretence', () => {
      // `?t=<date>` feeds a real moment to the real clock: the state that comes
      // back is whatever the sun is genuinely doing then, which is the honest
      // form of the back door and the one worth keeping distinct.
      ask('?t=2026-06-21T12:00:00Z');
      expect(forcedState()).toBeNull();
    });

    it('forces nothing for a state name it does not recognise', () => {
      ask('?t=half+past+four');
      expect(forcedState()).toBeNull();
    });
  });

  describe('reading the sun', () => {
    it('reads the given instant in the given zone', () => {
      ask('?t=2026-06-21T12:00:00Z&tz=Arctic/Longyearbyen');
      const clock = readTheSun();

      expect(clock.zone).toBe('Arctic/Longyearbyen');
      expect(clock.at.toISOString()).toBe('2026-06-21T12:00:00.000Z');
      // Midsummer at 78°N: the sun is up, and stays up.
      expect(clock.elevationDegrees).toBeGreaterThan(0);
      expect(clock.state).toBe('shuttered');
    });

    it('reads a real hour when nothing was asked for', () => {
      // Which hour that is depends on when this runs, so what is asserted is
      // that a complete reading came back rather than which one.
      ask('');
      const clock = readTheSun();

      expect(clock.at.getTime()).toBeCloseTo(Date.now(), -3);
      expect(clock.zone.length).toBeGreaterThan(0);
      expect(Number.isFinite(clock.elevationDegrees)).toBe(true);
    });

    it('leaves the sun real even when the state is forced', () => {
      // `?t=warning` does not fake the sun — the elevation, the location and
      // both crossings stay the real ones, so the countdown card and the
      // invitation are never exercised against numbers that could not occur.
      ask('?t=warning');
      const clock = readTheSun();

      expect(clock.at.getTime()).toBeCloseTo(Date.now(), -3);
      expect(Number.isFinite(clock.elevationDegrees)).toBe(true);
    });
  });

  it('re-reads once a minute, which is finer than the states need and cheap', () => {
    // The number matters to the piece's ending rather than to its states: a
    // visitor sitting through their own sunrise has to see the hotel close.
    expect(SUN_INTERVAL_MS).toBe(60_000);
  });
});
