import { ANCHOR_EYE, ANCHOR_TARGET, breathe, type ICameraPose, type IVec3 } from './drift';

/**
 * The camera.
 *
 * "It does not orbit; it breathes" is the entire brief for this module, and it
 * is a testable claim rather than a mood: an orbit pins the target and swings
 * the eye around it, so the two motions are anti-correlated and the distance
 * between them is constant. Breathing translates both together. The suite below
 * pins that down, along with the amplitude — because the failure mode here is
 * not a wrong formula, it is a right formula with a number an order of magnitude
 * too large, which turns a room someone is standing in into a dolly shot.
 */

const subtract = (a: IVec3, b: IVec3): IVec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const magnitude = (v: IVec3): number => Math.hypot(v.x, v.y, v.z);
const dot = (a: IVec3, b: IVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Poses across a long enough span to see every period at least twice. */
const samples: ICameraPose[] = Array.from({ length: 900 }, (_unused, index) =>
  breathe(index * 0.1)
);

describe('the breathing camera', () => {
  describe('at rest', () => {
    it('sits exactly on the anchor at time zero', () => {
      // Not incidental: the reduced-motion path renders `breathe(0)` and this is
      // what guarantees that frame is the composition the anchors describe.
      const pose = breathe(0);

      expect(pose.eye).toEqual(ANCHOR_EYE);
      expect(pose.target).toEqual(ANCHOR_TARGET);
      expect(pose.roll).toBe(0);
    });

    it('stands at a person’s eye height', () => {
      expect(ANCHOR_EYE.y).toBeGreaterThan(1.5);
      expect(ANCHOR_EYE.y).toBeLessThan(1.8);
    });

    it('looks towards the back of the room and slightly down', () => {
      expect(ANCHOR_TARGET.z).toBeGreaterThan(ANCHOR_EYE.z);
      expect(ANCHOR_TARGET.y).toBeLessThan(ANCHOR_EYE.y);
    });

    it('stands off the centre line', () => {
      // Dead centre puts the door and the desk symmetrically either side and
      // the room reads as a diagram.
      expect(Math.abs(ANCHOR_EYE.x)).toBeGreaterThan(0.3);
    });
  });

  describe('it breathes rather than orbits', () => {
    it('moves the gaze with the head, not against it', () => {
      // The discriminating test. Under an orbit the target is pinned, so the
      // dot product of the two displacements is zero or negative; under a
      // translation it is positive at every instant.
      for (const pose of samples) {
        const eyeMoved = subtract(pose.eye, ANCHOR_EYE);
        const targetMoved = subtract(pose.target, ANCHOR_TARGET);

        if (magnitude(eyeMoved) > 1e-6) {
          expect(dot(eyeMoved, targetMoved)).toBeGreaterThan(0);
        }
      }
    });

    it('actually moves the target', () => {
      // The other half: a target that never moves *is* an orbit, however small
      // the eye's circle.
      const travelled = samples.map((pose) => magnitude(subtract(pose.target, ANCHOR_TARGET)));
      expect(Math.max(...travelled)).toBeGreaterThan(0.01);
    });

    it('does not hold the eye at a constant distance from the target', () => {
      // An orbit's one geometric signature. A breath changes the distance,
      // which is what produces the parallax that reads as space.
      const distances = samples.map((pose) => magnitude(subtract(pose.target, pose.eye)));
      const spread = Math.max(...distances) - Math.min(...distances);

      expect(spread).toBeGreaterThan(0.01);
    });
  });

  describe('amplitude', () => {
    it('keeps the head inside a few centimetres of where it started', () => {
      // A body, not a dolly. If this ever fails, check the constant that grew
      // rather than loosening the bound.
      const travelled = samples.map((pose) => magnitude(subtract(pose.eye, ANCHOR_EYE)));
      expect(Math.max(...travelled)).toBeLessThan(0.25);
      // And it does have to move, or the piece is a still.
      expect(Math.max(...travelled)).toBeGreaterThan(0.05);
    });

    it('rolls by well under a degree', () => {
      const rolls = samples.map((pose) => Math.abs(pose.roll));
      expect(Math.max(...rolls)).toBeLessThan((0.5 * Math.PI) / 180);
      expect(Math.max(...rolls)).toBeGreaterThan(0);
    });

    it('never leaves the room', () => {
      // The shader's shell is x ±4.6, y 0..4, z -7..2.2. A camera outside it
      // renders the inside of a wall, which looks like a solid colour and is
      // impossible to diagnose from a screenshot.
      for (const pose of samples) {
        expect(Math.abs(pose.eye.x)).toBeLessThan(4.4);
        expect(pose.eye.y).toBeGreaterThan(0.3);
        expect(pose.eye.y).toBeLessThan(3.8);
        expect(pose.eye.z).toBeGreaterThan(-6.8);
        expect(pose.eye.z).toBeLessThan(2.0);
      }
    });
  });

  describe('it does not loop', () => {
    it('has no visible period inside two minutes', () => {
      // Three sinusoids at 11, 23.7 and 41.3 seconds have a common period
      // measured in hours. A single sine at any period is a loop a visitor
      // notices inside a minute, and a noticed loop turns a room into a
      // screensaver.
      const start = breathe(0);
      for (let seconds = 1; seconds <= 120; seconds += 0.5) {
        const later = breathe(seconds);
        const distance =
          magnitude(subtract(later.eye, start.eye)) + Math.abs(later.roll - start.roll);
        // It may pass close to the anchor — it must not come to rest on it.
        if (distance < 1e-4) {
          expect.unreachable(`the camera repeated its origin at ${seconds}s`);
        }
      }
    });

    it('keeps moving over an hour', () => {
      const late = Array.from({ length: 200 }, (_unused, index) => breathe(3000 + index * 0.37));
      const spread =
        Math.max(...late.map((pose) => pose.eye.x)) - Math.min(...late.map((pose) => pose.eye.x));

      expect(spread).toBeGreaterThan(0.05);
    });
  });

  describe('determinism', () => {
    it('gives the same pose for the same second, always', () => {
      // What makes the fixed-step loop worth having: two machines at the same
      // simulated second see the same room.
      expect(breathe(37.5)).toEqual(breathe(37.5));
    });

    it('is continuous — no frame-to-frame jumps', () => {
      // A discontinuity here would present as a single-frame flicker, which is
      // close to impossible to catch by eye and trivial to catch like this.
      for (let index = 1; index < samples.length; index += 1) {
        const step = magnitude(subtract(samples[index].eye, samples[index - 1].eye));
        expect(step).toBeLessThan(0.01);
      }
    });
  });

  describe('a broken clock', () => {
    it.each([
      ['NaN', Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY],
      ['negatively infinite', Number.NEGATIVE_INFINITY],
    ])('falls back to the anchor pose on a %s time', (_name, seconds) => {
      // Not defensive decoration: NaN uniforms do not throw, they render a black
      // screen with no error anywhere in the console.
      const pose = breathe(seconds);

      expect(pose.eye).toEqual(ANCHOR_EYE);
      expect(pose.target).toEqual(ANCHOR_TARGET);
      expect(pose.roll).toBe(0);
    });

    it('handles a negative time without producing nonsense', () => {
      // Reachable through the accumulator's alpha on a restarted loop.
      const pose = breathe(-4);
      expect(Number.isFinite(pose.eye.x)).toBe(true);
      expect(magnitude(subtract(pose.eye, ANCHOR_EYE))).toBeLessThan(0.25);
    });
  });
});
