import type * as THREE from 'three';
import * as CALIBRATION from './batoid-calibration';
import { spread } from './batoid-transformation';
import { Random } from './batoid-types';
import { createCauldron } from './cauldron-creation';

type Triple = readonly [number, number, number];

/**
 * A source that walks `draws` in order and starts again at the end. Each bat
 * takes four draws — x, y, z, heading — so a sequence whose length is a
 * multiple of four would hand every bat the same pose.
 */
const sequence = (draws: readonly number[]): Random => {
  let next = 0;
  return () => draws[next++ % draws.length];
};

interface IPose {
  readonly position: Triple;
  /** Where the bat's local +x points once posed; a turn about y moves it in the xz plane. */
  readonly facing: Triple;
  /** How long the bat's local +x has become: its scale, for a uniform one. */
  readonly scale: number;
}

/**
 * Bat `index`'s pose, read straight out of the instance buffer. Each bat is a
 * column-major 4×4 matrix: elements 12–14 are its translation, and column 0
 * (elements 0–2) is where local +x went under rotation and scale together.
 */
const poseOf = (flock: THREE.InstancedMesh, index: number): IPose => {
  const m = flock.instanceMatrix.array.slice(index * 16, index * 16 + 16);
  const scale = Math.hypot(m[0], m[1], m[2]);
  return {
    position: [m[12], m[13], m[14]],
    facing: [m[0] / scale, m[1] / scale, m[2] / scale],
    scale,
  };
};

/**
 * What a turn of `heading` radians about y does to local +x. Compared as a
 * direction rather than read back as an Euler angle, because a turn past 90°
 * decomposes as `x = π, y = π − h, z = π` and the assertion would lie.
 */
const facingFor = (heading: number): Triple => [Math.cos(heading), 0, -Math.sin(heading)];

/**
 * The instance buffer is a `Float32Array`, so a pose comes back with about
 * seven significant digits; five decimal places is comfortably inside that.
 */
const DIGITS = 5;

const expectNear = (actual: Triple, expected: Triple): void => {
  expect(actual[0]).toBeCloseTo(expected[0], DIGITS);
  expect(actual[1]).toBeCloseTo(expected[1], DIGITS);
  expect(actual[2]).toBeCloseTo(expected[2], DIGITS);
};

describe('createCauldron', () => {
  const made: THREE.InstancedMesh[] = [];

  /** Every cauldron a test makes is released after it, as the component would. */
  const cauldron = (random: Random): THREE.InstancedMesh => {
    const flock = createCauldron(random);
    made.push(flock);
    return flock;
  };

  afterEach(() => {
    for (const flock of made.splice(0)) {
      flock.geometry.dispose();
      (flock.material as THREE.Material).dispose();
      flock.dispose();
    }
  });

  it('holds one instance per bat in the cauldron', () => {
    expect(cauldron(Math.random).count).toBe(CALIBRATION.CAULDRON.count);
  });

  it('draws exactly four times per bat, so the seed decides the same flock every time', () => {
    const random = vi.fn(() => 0.5);

    cauldron(random);

    expect(random).toHaveBeenCalledTimes(4 * CALIBRATION.CAULDRON.count);
  });

  it('places each bat from the given chance, drawing x, y, z and then heading', () => {
    // Five draws, so bat 1 starts where bat 0 left off rather than repeating it.
    const flock = cauldron(sequence([0.1, 0.5, 0.9, 0.3, 0.7]));
    const { halfWidth, halfHeight } = CALIBRATION.CAULDRON;
    const at = (draw: number, radius: number): number => spread(() => draw, radius);

    const first = poseOf(flock, 0);
    expectNear(first.position, [at(0.1, halfWidth), at(0.5, halfHeight), at(0.9, halfWidth)]);
    expectNear(first.facing, facingFor(0.3 * Math.PI * 2));

    const second = poseOf(flock, 1);
    expectNear(second.position, [at(0.7, halfWidth), at(0.1, halfHeight), at(0.5, halfWidth)]);
    expectNear(second.facing, facingFor(0.9 * Math.PI * 2));
  });

  it('keeps every bat inside the cauldron at both extremes of chance', () => {
    // 0 and the largest draw below 1 are where an off-by-a-factor bound would show.
    const flock = cauldron(sequence([0, 1 - Number.EPSILON, 0]));
    const { halfWidth, halfHeight } = CALIBRATION.CAULDRON;
    // Slack for the float32 round trip, not for the bound itself.
    const slack = 1e-6;

    for (let i = 0; i < flock.count; i++) {
      const [x, y, z] = poseOf(flock, i).position;
      expect(Math.abs(x)).toBeLessThanOrEqual(halfWidth + slack);
      expect(Math.abs(y)).toBeLessThanOrEqual(halfHeight + slack);
      expect(Math.abs(z)).toBeLessThanOrEqual(halfWidth + slack);
    }
  });

  it('shrinks every bat to the same size, so a cauldron of them does not overlap into one', () => {
    const flock = cauldron(Math.random);

    for (let i = 0; i < flock.count; i++) {
      expect(poseOf(flock, i).scale).toBeCloseTo(CALIBRATION.CAULDRON.batScale, DIGITS);
    }
  });

  it('marks the instance buffer for upload, or the GPU would draw every bat at the origin', () => {
    // `needsUpdate = true` is a setter that bumps `version`; the renderer
    // re-uploads the buffer when the version has moved.
    expect(cauldron(Math.random).instanceMatrix.version).toBeGreaterThan(0);
  });

  it('dresses the flock in the palette, flat-shaded', () => {
    const material = cauldron(Math.random).material as THREE.MeshStandardMaterial;

    expect(material.color.getHex()).toBe(CALIBRATION.PALETTE.batoid);
    expect(material.flatShading).toBe(true);
  });
});
