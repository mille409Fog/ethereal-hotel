import {
  ASTRONOMICAL_TWILIGHT_DEGREES,
  AUBADE_STATES,
  CIVIL_TWILIGHT_DEGREES,
  NAUTICAL_TWILIGHT_DEGREES,
  SUNRISE_DEGREES,
  stateForElevation,
  type AubadeState,
} from './state';

/**
 * The state machine, boundary by boundary.
 *
 * AUBADE's Phase 0 DoD asks that every state boundary have a test, and there are
 * only four of them, so this is exhaustive rather than representative: each
 * boundary is checked exactly on the threshold, one ten-thousandth of a degree
 * below it, and one above. A ten-thousandth of a degree is about six seconds of
 * the sun's motion — small enough that the intent is unambiguous, large enough
 * that no floating-point comparison is being asked to do something silly.
 *
 * The half-open convention (lower bound inclusive) is the load-bearing decision
 * these tests pin down. It is not arbitrary: it makes the five states tile the
 * real line exactly once, so there is no elevation the hotel has no answer for
 * and none it has two answers for. Exactly −0.833° being `shuttered` follows from
 * what the constant means — at that elevation the sun has, by definition, risen.
 */

/** Where a state sits in the darkest-to-brightest order. */
function rank(state: AubadeState): number {
  return AUBADE_STATES.indexOf(state);
}

describe('the state machine', () => {
  describe('thresholds are the standard twilight definitions', () => {
    it('uses the astronomical, nautical and civil twilight angles', () => {
      expect(ASTRONOMICAL_TWILIGHT_DEGREES).toBe(-18);
      expect(NAUTICAL_TWILIGHT_DEGREES).toBe(-12);
      expect(CIVIL_TWILIGHT_DEGREES).toBe(-6);
    });

    it('defines sunrise with refraction and the solar radius, not at zero', () => {
      // 0.5667° of refraction at the horizon plus the sun's 0.2667° angular
      // radius. Using 0° here would be wrong by roughly three minutes at London's
      // latitude and by considerably more at Reykjavík's.
      expect(SUNRISE_DEGREES).toBe(-0.833);
    });
  });

  describe('boundaries', () => {
    const epsilon = 0.0001;

    it('opens the hotel below astronomical twilight', () => {
      expect(stateForElevation(ASTRONOMICAL_TWILIGHT_DEGREES - epsilon)).toBe('open');
      expect(stateForElevation(-30)).toBe('open');
      expect(stateForElevation(-90)).toBe('open');
    });

    it('turns to late exactly at −18°', () => {
      expect(stateForElevation(ASTRONOMICAL_TWILIGHT_DEGREES)).toBe('late');
      expect(stateForElevation(ASTRONOMICAL_TWILIGHT_DEGREES + epsilon)).toBe('late');
    });

    it('turns to the warning exactly at −12°', () => {
      expect(stateForElevation(NAUTICAL_TWILIGHT_DEGREES - epsilon)).toBe('late');
      expect(stateForElevation(NAUTICAL_TWILIGHT_DEGREES)).toBe('warning');
      expect(stateForElevation(NAUTICAL_TWILIGHT_DEGREES + epsilon)).toBe('warning');
    });

    it('turns to the aubade exactly at −6°', () => {
      expect(stateForElevation(CIVIL_TWILIGHT_DEGREES - epsilon)).toBe('warning');
      expect(stateForElevation(CIVIL_TWILIGHT_DEGREES)).toBe('aubade');
      expect(stateForElevation(CIVIL_TWILIGHT_DEGREES + epsilon)).toBe('aubade');
    });

    it('shutters exactly at sunrise', () => {
      expect(stateForElevation(SUNRISE_DEGREES - epsilon)).toBe('aubade');
      expect(stateForElevation(SUNRISE_DEGREES)).toBe('shuttered');
      expect(stateForElevation(SUNRISE_DEGREES + epsilon)).toBe('shuttered');
    });

    it('stays shuttered all the way to the zenith', () => {
      expect(stateForElevation(0)).toBe('shuttered');
      expect(stateForElevation(45)).toBe('shuttered');
      expect(stateForElevation(90)).toBe('shuttered');
    });
  });

  describe('totality', () => {
    it('answers with one of the five states for every elevation', () => {
      // A quarter-degree sweep of the whole possible range. The point is not the
      // resolution; it is that no input falls through the ladder to `undefined`.
      for (let elevation = -90; elevation <= 90; elevation += 0.25) {
        const state = stateForElevation(elevation);
        expect(AUBADE_STATES, `elevation ${elevation}`).toContain(state);
      }
    });

    it('never moves backwards as the sun rises', () => {
      // The hotel closes in one direction. If the ladder is ever mis-ordered —
      // the easiest mistake to make writing it — this catches it, where the
      // boundary tests above could still pass on a ladder that is wrong between
      // the points they sample.
      let previous = rank(stateForElevation(-90));

      for (let elevation = -90; elevation <= 90; elevation += 0.05) {
        const current = rank(stateForElevation(elevation));
        expect(current, `elevation ${elevation} went backwards`).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
    });

    it('visits all five states on the way up', () => {
      const seen = new Set<AubadeState>();
      for (let elevation = -90; elevation <= 90; elevation += 0.05) {
        seen.add(stateForElevation(elevation));
      }
      expect([...seen].sort()).toEqual([...AUBADE_STATES].sort());
    });
  });

  describe('a broken clock', () => {
    /**
     * If the elevation is not a number, something upstream has failed and the
     * piece still has to render. `shuttered` is the right failure: it is the
     * daytime work, it carries the invitation control, and a visitor who takes it
     * reaches the entire night piece in one click. Failing to `open` instead would
     * silently promote a broken clock to the best state in the piece and lose the
     * one property the whole thing is built on — that the state is the sun's, and
     * not the site's choice.
     */
    it('shutters rather than guessing', () => {
      expect(stateForElevation(Number.NaN)).toBe('shuttered');
      expect(stateForElevation(Number.POSITIVE_INFINITY)).toBe('shuttered');
    });

    it('treats minus infinity as the night it literally is', () => {
      expect(stateForElevation(Number.NEGATIVE_INFINITY)).toBe('open');
    });
  });

  describe('the state list', () => {
    it('runs darkest to brightest', () => {
      expect(AUBADE_STATES).toEqual(['open', 'late', 'warning', 'aubade', 'shuttered']);
    });
  });
});
