import {
  floorAfter,
  floorBefore,
  liftHasArrived,
  LIFT_SECONDS,
  MORPH_EPSILON,
  morphAt,
  morphForFloor,
  type LiftDirection,
} from './descent';

/**
 * The lift.
 *
 * Almost everything here is about `morphAt`, and almost everything about
 * `morphAt` is about its two endpoints. The interesting failure is not a wrong
 * curve — a wrong curve is visible in one ride — it is a curve that is right
 * everywhere except that it reaches 0.9997 instead of 1. Nothing looks broken:
 * the corridor arrives, the picture is correct, and the frame silently costs two
 * scene evaluations forever afterwards while the mirror, which only wakes at the
 * endpoint, never turns on at all. So the endpoints are asserted exactly, and the
 * shape is asserted as properties rather than as sampled values, because pinning
 * the curve to a table of numbers would make it unimprovable.
 */

/** Both directions, for the properties that hold whichever way the car is going. */
const directions: readonly LiftDirection[] = ['down', 'up'];

/** A ride, sampled finely enough to see any non-monotonic wobble in the easing. */
const ride = (direction: LiftDirection, steps = 300): number[] =>
  Array.from({ length: steps + 1 }, (_unused, index) =>
    morphAt((index / steps) * LIFT_SECONDS, direction)
  );

describe('the lift', () => {
  describe('the floors it joins', () => {
    it('goes down to the corridor and up to the lobby', () => {
      expect(floorAfter('down')).toBe(-1);
      expect(floorAfter('up')).toBe(0);
    });

    it('departs the floor it is not arriving at', () => {
      for (const direction of directions) {
        expect(floorBefore(direction)).not.toBe(floorAfter(direction));
      }
    });

    it('parks each floor on the endpoint of the morph', () => {
      // The settled floors have to be the exact values, not merely near them —
      // same reason as the endpoints below.
      expect(morphForFloor(0)).toBe(0);
      expect(morphForFloor(-1)).toBe(1);
    });
  });

  describe('the morph’s endpoints are exact', () => {
    it('starts on the floor it departed', () => {
      expect(morphAt(0, 'down')).toBe(0);
      expect(morphAt(0, 'up')).toBe(1);
    });

    it('ends on the floor it arrived at', () => {
      expect(morphAt(LIFT_SECONDS, 'down')).toBe(1);
      expect(morphAt(LIFT_SECONDS, 'up')).toBe(0);
    });

    it('stays there afterwards rather than continuing', () => {
      // A frame or two always lands past the end before the component retires
      // the lift, and an unclamped curve keeps going — past 1, into a corridor
      // that starts inverting.
      for (const overshoot of [0.001, 1, 60, 3600]) {
        expect(morphAt(LIFT_SECONDS + overshoot, 'down')).toBe(1);
        expect(morphAt(LIFT_SECONDS + overshoot, 'up')).toBe(0);
      }
    });

    it('has not left before it left', () => {
      for (const early of [-0.001, -1, -3600]) {
        expect(morphAt(early, 'down')).toBe(0);
        expect(morphAt(early, 'up')).toBe(1);
      }
    });

    it('survives a corrupted clock without stranding anyone between floors', () => {
      // A NaN here would upload a NaN uniform, which a driver renders as a black
      // screen with nothing in the console. Arriving is the safe answer: it is
      // the state the component can act on.
      for (const direction of directions) {
        expect(morphAt(Number.NaN, direction)).toBe(morphAt(LIFT_SECONDS, direction));
        expect(morphAt(Number.POSITIVE_INFINITY, direction)).toBe(morphAt(LIFT_SECONDS, direction));
      }
    });
  });

  describe('the ride is unhurried', () => {
    it('never turns back on itself', () => {
      // Monotonic in the direction of travel. An easing curve with an overshoot
      // — the ones that look best on a button — would send the corridor briefly
      // past itself and back, which on two mixed distance fields is not a bounce,
      // it is the room turning inside out.
      for (const direction of directions) {
        const samples = ride(direction);
        const rising = direction === 'down';

        for (let index = 1; index < samples.length; index += 1) {
          if (rising) {
            expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1]);
          } else {
            expect(samples[index]).toBeLessThanOrEqual(samples[index - 1]);
          }
        }
      }
    });

    it('stays inside the two distance fields it is mixing', () => {
      for (const direction of directions) {
        for (const value of ride(direction)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    });

    it('leaves and arrives at rest rather than at speed', () => {
      // The whole of "unhurried". A linear ramp starts and stops instantly, and
      // reads as a cut with a delay in it. Eased, the first and last tenth of the
      // ride cover much less ground than the middle tenth does.
      const samples = ride('down', 300);
      const tenth = 30;

      const leaving = samples[tenth] - samples[0];
      const middle =
        samples[(samples.length - 1) / 2 + tenth / 2] -
        samples[(samples.length - 1) / 2 - tenth / 2];
      const arriving = samples[samples.length - 1] - samples[samples.length - 1 - tenth];

      expect(leaving).toBeLessThan(middle / 2);
      expect(arriving).toBeLessThan(middle / 2);
    });

    it('is halfway through the morph halfway through the ride', () => {
      // Symmetric. Not an aesthetic requirement on its own — it is what makes the
      // ride up the ride down in reverse, so a visitor who goes down and comes
      // straight back sees one motion and not two.
      expect(morphAt(LIFT_SECONDS / 2, 'down')).toBeCloseTo(0.5, 6);
      expect(morphAt(LIFT_SECONDS / 2, 'up')).toBeCloseTo(0.5, 6);
    });

    it('is the ride down reversed', () => {
      const steps = 120;
      for (let index = 0; index <= steps; index += 1) {
        const seconds = (index / steps) * LIFT_SECONDS;
        expect(morphAt(seconds, 'up')).toBeCloseTo(1 - morphAt(seconds, 'down'), 10);
      }
    });

    it('clears the shader’s scene-skipping threshold on both sides', () => {
      // The branch in hotel.frag.ts only fires inside MORPH_EPSILON of an
      // endpoint. A curve that spends the first second below that threshold has a
      // lift that visibly does nothing before it starts.
      const justAfterLeaving = morphAt(LIFT_SECONDS * 0.25, 'down');
      expect(justAfterLeaving).toBeGreaterThan(MORPH_EPSILON);
      expect(justAfterLeaving).toBeLessThan(1 - MORPH_EPSILON);
    });
  });

  describe('arrival', () => {
    it('has not arrived while the car is moving', () => {
      expect(liftHasArrived(0)).toBe(false);
      expect(liftHasArrived(LIFT_SECONDS / 2)).toBe(false);
      expect(liftHasArrived(LIFT_SECONDS - 0.001)).toBe(false);
    });

    it('arrives at the end and stays arrived', () => {
      expect(liftHasArrived(LIFT_SECONDS)).toBe(true);
      expect(liftHasArrived(LIFT_SECONDS + 600)).toBe(true);
    });

    it('arrives on a corrupted clock rather than hanging between floors', () => {
      expect(liftHasArrived(Number.NaN)).toBe(true);
      expect(liftHasArrived(Number.POSITIVE_INFINITY)).toBe(true);
    });

    it('agrees with the morph about when the ride is over', () => {
      // The two are read on the same frame and a disagreement is a floor that
      // settles one frame before or after the picture does.
      for (const direction of directions) {
        expect(morphAt(LIFT_SECONDS, direction)).toBe(morphForFloor(floorAfter(direction)));
      }
    });
  });

  describe('the ride is worth taking', () => {
    it('lasts long enough to be watched', () => {
      // "Visible and unhurried." Under six seconds the two distance fields pass
      // through each other too fast to read as anything but a dissolve.
      expect(LIFT_SECONDS).toBeGreaterThanOrEqual(6);
      expect(LIFT_SECONDS).toBeLessThanOrEqual(12);
    });
  });
});
