import {
  canCall,
  depthAt,
  depthForFloor,
  easeInOutSine,
  FLOORS,
  floorAfter,
  liftHasArrived,
  LIFT_SECONDS,
  LOWEST_FLOOR,
  MORPH_EPSILON,
  type Floor,
  type LiftDirection,
} from './descent';

/**
 * The lift.
 *
 * Almost everything here is about `depthAt`, and almost everything about
 * `depthAt` is about its endpoints. The interesting failure is not a wrong curve
 * — a wrong curve is visible in one ride — it is a curve that is right everywhere
 * except that it reaches 0.9997 instead of 1. Nothing looks broken: the corridor
 * arrives, the picture is correct, and the frame silently costs two scene
 * evaluations forever afterwards while the mirror, which only wakes at the
 * endpoint, never turns on at all.
 *
 * Since the shaft went to four floors there are four such values rather than
 * two, and one more way to get it wrong: a curve that is exact on the first leg
 * and accumulates a float's worth of error on the ones after it. So every leg is
 * asserted on its own, exactly, with `toBe`. The shape is asserted as properties
 * rather than as sampled values, because pinning the curve to a table of numbers
 * would make it unimprovable.
 */

/** The six rides that exist. Every leg, both ways. */
const legs: ReadonlyArray<{ from: Floor; direction: LiftDirection }> = [
  { from: 0, direction: 'down' },
  { from: -1, direction: 'down' },
  { from: -2, direction: 'down' },
  { from: -1, direction: 'up' },
  { from: -2, direction: 'up' },
  { from: -3, direction: 'up' },
];

/** A ride, sampled finely enough to see any non-monotonic wobble in the easing. */
const ride = (from: Floor, direction: LiftDirection, steps = 300): number[] =>
  Array.from({ length: steps + 1 }, (_unused, index) =>
    depthAt((index / steps) * LIFT_SECONDS, from, direction)
  );

describe('the lift', () => {
  describe('the shaft it runs in', () => {
    it('serves five floors, deepest last', () => {
      expect(FLOORS).toEqual([0, -1, -2, -3, -4]);
      expect(LOWEST_FLOOR).toBe(-4);
    });

    it('parks each floor on an exact depth, and depth is minus the floor', () => {
      // The settled floors have to be the exact values, not merely near them —
      // same reason as the endpoints below. The identity is also the reason the
      // lift is expressed as a depth at all, so it is worth asserting as one.
      //
      // Written as an absolute value rather than as the negation the identity
      // actually claims, because `-0` is what negating the lobby produces and
      // `toBe` is `Object.is`, which separates it from `0`. The assertion would
      // otherwise be demanding the very hazard `depthForFloor` exists to avoid.
      // Every floor is at or below zero, so the two agree everywhere.
      for (const floor of FLOORS) {
        expect(depthForFloor(floor)).toBe(Math.abs(floor));
      }
      expect(depthForFloor(0)).toBe(0);
      expect(depthForFloor(-1)).toBe(1);
      expect(depthForFloor(-2)).toBe(2);
      expect(depthForFloor(-3)).toBe(3);
      expect(depthForFloor(-4)).toBe(4);
    });

    it('will not be called through the roof or the floor', () => {
      expect(canCall(0, 'up')).toBe(false);
      expect(canCall(LOWEST_FLOOR, 'down')).toBe(false);

      expect(canCall(0, 'down')).toBe(true);
      expect(canCall(-1, 'down')).toBe(true);
      expect(canCall(-2, 'down')).toBe(true);
      expect(canCall(-1, 'up')).toBe(true);
      expect(canCall(-2, 'up')).toBe(true);
      expect(canCall(-3, 'up')).toBe(true);
    });

    it('moves one floor at a time', () => {
      // Never two. The shader mixes adjacent distance fields and has no pair for
      // the lobby and the library, so a ride that skipped the corridor would be
      // asking for a mix that does not exist.
      for (const { from, direction } of legs) {
        expect(Math.abs(floorAfter(from, direction) - from)).toBe(1);
      }
    });

    it('stays where it is when there is nowhere to go', () => {
      expect(floorAfter(0, 'up')).toBe(0);
      expect(floorAfter(LOWEST_FLOOR, 'down')).toBe(LOWEST_FLOOR);
    });

    it('departs the floor it is not arriving at', () => {
      for (const { from, direction } of legs) {
        expect(floorAfter(from, direction)).not.toBe(from);
      }
    });
  });

  describe('the depth’s endpoints are exact', () => {
    it('starts on the floor it departed', () => {
      for (const { from, direction } of legs) {
        expect(depthAt(0, from, direction)).toBe(depthForFloor(from));
      }
    });

    it('ends on the floor it arrived at', () => {
      for (const { from, direction } of legs) {
        expect(depthAt(LIFT_SECONDS, from, direction)).toBe(
          depthForFloor(floorAfter(from, direction))
        );
      }
    });

    it('is exact on the second leg as well as the first', () => {
      // The one failure the two-floor version could not have. An implementation
      // that adds an eased fraction to a base depth is exact at 0 and 1 and has
      // to be exact at 2 as well; one that interpolates towards a target by
      // `a + (b - a) * t` is not, and the library would never quite arrive.
      expect(depthAt(LIFT_SECONDS, -1, 'down')).toBe(2);
      expect(depthAt(LIFT_SECONDS, -2, 'up')).toBe(1);
    });

    it('stays there afterwards rather than continuing', () => {
      // A frame or two always lands past the end before the component retires
      // the lift, and an unclamped curve keeps going — past the library, into a
      // room that starts inverting.
      for (const { from, direction } of legs) {
        const arrived = depthForFloor(floorAfter(from, direction));
        for (const overshoot of [0.001, 1, 60, 3600]) {
          expect(depthAt(LIFT_SECONDS + overshoot, from, direction)).toBe(arrived);
        }
      }
    });

    it('has not left before it left', () => {
      for (const { from, direction } of legs) {
        for (const early of [-0.001, -1, -3600]) {
          expect(depthAt(early, from, direction)).toBe(depthForFloor(from));
        }
      }
    });

    it('survives a corrupted clock without stranding anyone between floors', () => {
      // A NaN here would upload a NaN uniform, which a driver renders as a black
      // screen with nothing in the console. Arriving is the safe answer: it is
      // the state the component can act on.
      for (const { from, direction } of legs) {
        expect(depthAt(Number.NaN, from, direction)).toBe(depthAt(LIFT_SECONDS, from, direction));
        expect(depthAt(Number.POSITIVE_INFINITY, from, direction)).toBe(
          depthAt(LIFT_SECONDS, from, direction)
        );
      }
    });

    it('never moves on a ride that cannot happen', () => {
      // The controls are gated on `canCall`, so this should be unreachable — but
      // an unreachable call that quietly returned depth 3 would put the camera
      // below the building and the shader in a scene that does not exist.
      for (const seconds of [0, LIFT_SECONDS / 2, LIFT_SECONDS, 600]) {
        expect(depthAt(seconds, 0, 'up')).toBe(0);
        expect(depthAt(seconds, LOWEST_FLOOR, 'down')).toBe(depthForFloor(LOWEST_FLOOR));
      }
    });
  });

  describe('the ride is unhurried', () => {
    it('never turns back on itself', () => {
      // Monotonic in the direction of travel. An easing curve with an overshoot
      // — the ones that look best on a button — would send the arriving room
      // briefly past itself and back, which on two mixed distance fields is not a
      // bounce, it is the room turning inside out.
      for (const { from, direction } of legs) {
        const samples = ride(from, direction);
        const descending = direction === 'down';

        for (let index = 1; index < samples.length; index += 1) {
          if (descending) {
            expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1]);
          } else {
            expect(samples[index]).toBeLessThanOrEqual(samples[index - 1]);
          }
        }
      }
    });

    it('stays inside the two distance fields it is mixing', () => {
      // Not merely inside [0, 2] — inside *this leg*. A ride from the corridor to
      // the library that dipped to 0.9 would be mixing the lobby back in, one
      // floor after the visitor left it.
      for (const { from, direction } of legs) {
        const low = Math.min(depthForFloor(from), depthForFloor(floorAfter(from, direction)));
        const high = Math.max(depthForFloor(from), depthForFloor(floorAfter(from, direction)));

        for (const value of ride(from, direction)) {
          expect(value).toBeGreaterThanOrEqual(low);
          expect(value).toBeLessThanOrEqual(high);
        }
      }
    });

    it('leaves and arrives at rest rather than at speed', () => {
      // The whole of "unhurried". A linear ramp starts and stops instantly, and
      // reads as a cut with a delay in it. Eased, the first and last tenth of the
      // ride cover much less ground than the middle tenth does.
      for (const { from, direction } of legs) {
        const samples = ride(from, direction, 300);
        const tenth = 30;
        const middleIndex = (samples.length - 1) / 2;

        const leaving = Math.abs(samples[tenth] - samples[0]);
        const middle = Math.abs(
          samples[middleIndex + tenth / 2] - samples[middleIndex - tenth / 2]
        );
        const arriving = Math.abs(
          samples[samples.length - 1] - samples[samples.length - 1 - tenth]
        );

        expect(leaving).toBeLessThan(middle / 2);
        expect(arriving).toBeLessThan(middle / 2);
      }
    });

    it('is halfway between the floors halfway through the ride', () => {
      // Symmetric. Not an aesthetic requirement on its own — it is what makes the
      // ride up the ride down in reverse, so a visitor who goes down and comes
      // straight back sees one motion and not two.
      for (const { from, direction } of legs) {
        const middle = (depthForFloor(from) + depthForFloor(floorAfter(from, direction))) / 2;
        expect(depthAt(LIFT_SECONDS / 2, from, direction)).toBeCloseTo(middle, 6);
      }
    });

    it('is the ride down reversed', () => {
      // Each leg against itself, both ways. Checked per leg rather than over the
      // whole shaft, because the two legs are two separate rides and nothing
      // requires the second to be the first shifted by one.
      const steps = 120;
      for (const { from, direction } of legs.filter((leg) => leg.direction === 'down')) {
        const back = floorAfter(from, direction);
        const total = depthForFloor(from) + depthForFloor(back);

        for (let index = 0; index <= steps; index += 1) {
          const seconds = (index / steps) * LIFT_SECONDS;
          expect(depthAt(seconds, back, 'up')).toBeCloseTo(
            total - depthAt(seconds, from, 'down'),
            10
          );
        }
      }
    });

    it('clears the shader’s mirror threshold on both sides', () => {
      // The mirror in hotel.frag.ts only wakes inside MORPH_EPSILON of depth 1.
      // A curve that spends the first second inside that band has a lift that
      // visibly does nothing before it starts. The scene branch next to it needs
      // no such clearance — it has no epsilon — so this is the wider of the two
      // demands the shader makes on the curve, and the only one worth asserting.
      for (const { from, direction } of legs) {
        const departed = depthForFloor(from);
        const arriving = depthForFloor(floorAfter(from, direction));
        const quarter = depthAt(LIFT_SECONDS * 0.25, from, direction);

        expect(Math.abs(quarter - departed)).toBeGreaterThan(MORPH_EPSILON);
        expect(Math.abs(quarter - arriving)).toBeGreaterThan(MORPH_EPSILON);
      }
    });
  });

  describe('the easing itself', () => {
    it('is exact at both ends', () => {
      // Where the exactness the whole file depends on actually comes from. If
      // this is not exact, nothing built on it can be.
      expect(easeInOutSine(0)).toBe(0);
      expect(easeInOutSine(1)).toBe(1);
    });

    it('is flat at both ends and steepest in the middle', () => {
      expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 12);
      expect(easeInOutSine(0.05)).toBeLessThan(0.05);
      expect(easeInOutSine(0.95)).toBeGreaterThan(0.95);
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

    it('agrees with the depth about when the ride is over', () => {
      // The two are read on the same frame and a disagreement is a floor that
      // settles one frame before or after the picture does.
      for (const { from, direction } of legs) {
        expect(depthAt(LIFT_SECONDS, from, direction)).toBe(
          depthForFloor(floorAfter(from, direction))
        );
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
