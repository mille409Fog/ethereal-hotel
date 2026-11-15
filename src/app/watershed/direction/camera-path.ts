/**
 * where the camera stands and what it looks at, as a pure function of the storm's two clocks, `p` and `e`
 * (`direction.ts` says what they are), of the valley the storm found, and of how far the visitor has turned it.
 *
 * four legs, one after another, and the hero shot at the end of the third:
 *
 * 1. **the storm**, while `p` < 1: the stage's high three-quarter view, turning `stormArc` degrees round the block
 *    over the whole storm. the arc is counted in `p`, not seconds, so a paused storm holds still and a slow
 *    device turns as slowly as it erodes. at `p = 0` it is exactly the stage's own vantage.
 * 2. **the descent**, over `descentSeconds` of `e`: across to the main valley's mouth while still high, and down
 *    to it only at the end, so it never comes low over ground it has not yet crossed.
 * 3. **the pass**, over `passSeconds`: up the valley from its mouth, low, looking ahead along it. the camera is
 *    kept `passClearance` above the highest ground under the path from `passGuard` behind it to as far ahead as
 *    it is looking, so a valley that climbs is climbed before it is reached.
 * 4. **the settle**, over `settleSeconds`: up first, then out to the hero shot, standing `heroDistance` off the
 *    block's centre, low, turned `heroSunOffset` off the golden sun so the land is lit across. then the orbit
 *    begins, `orbitRate` degrees a second, and from there the visitor may turn it, within bounds.
 *
 * moves that cover ground are made round the block's vertical axis, in distance, bearing and height, rather than
 * in a straight line, which from one side of the block to the other would go through it. each leg starts and
 * ends at rest, so where two meet nothing jolts.
 *
 * a valley of null, which the storm hands over when it found none, skips the pass: the camera goes from the
 * storm's view to the hero shot in the same time, so the hero shot is at the same `e` whatever the land.
 *
 * a leaf module: Node imports it, so the verifying script draws from where the route stands. its calibration and
 * the stage's vantage are arguments for the same reason. see `model/fields.ts`.
 */
import type { IDirection } from './direction-calibration';
import type { Vector } from './direction';
import type { IValley } from './valley';

export interface IPose {
  readonly eye: Vector;
  readonly target: Vector;
}

/** how far the visitor has turned the orbit, degrees: round the block, and up */
export interface ISteer {
  readonly yaw: number;
  readonly pitch: number;
}

export const UNSTEERED: ISteer = { yaw: 0, pitch: 0 };

const DEGREES = 180 / Math.PI;

function ease(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixVector(a: Vector, b: Vector, t: number): Vector {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

/** seconds of `e` at which the hero shot is reached and the orbit begins */
export function heroSeconds(d: IDirection): number {
  return d.descentSeconds + d.passSeconds + d.settleSeconds;
}

/** true once the visitor may turn the camera: the orbit has begun */
export function steerable(p: number, e: number, d: IDirection): boolean {
  return p >= 1 && e >= heroSeconds(d);
}

/** a turn of the orbit by `yaw` and `pitch` more degrees, held within the calibrated heights */
export function steer(from: ISteer, yaw: number, pitch: number, d: IDirection): ISteer {
  const lowest = d.orbitLowest - d.heroElevation;
  const highest = d.orbitHighest - d.heroElevation;
  return { yaw: from.yaw + yaw, pitch: Math.min(highest, Math.max(lowest, from.pitch + pitch)) };
}

/** the storm's view at progress `p`: the stage's vantage turned round the vertical through what it looks at */
function stormPose(p: number, vantage: IPose, d: IDirection): IPose {
  const turn = (d.stormArc * p) / DEGREES;
  const [tx, , tz] = vantage.target;
  const dx = vantage.eye[0] - tx;
  const dz = vantage.eye[2] - tz;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return {
    eye: [tx + dx * c - dz * s, vantage.eye[1], tz + dx * s + dz * c],
    target: vantage.target,
  };
}

/** the orbit at `e`, turned by the visitor's steer; at the hero moment and unsteered, the hero shot */
function orbitPose(e: number, by: ISteer, d: IDirection): IPose {
  const bearing =
    (d.goldenSunBearing +
      180 -
      d.heroSunOffset +
      d.orbitRate * Math.max(0, e - heroSeconds(d)) +
      by.yaw) /
    DEGREES;
  const elevation = (d.heroElevation + by.pitch) / DEGREES;
  const target: Vector = [0, d.heroTargetHeight, 0];
  return {
    eye: [
      d.heroDistance * Math.cos(elevation) * Math.cos(bearing),
      target[1] + d.heroDistance * Math.sin(elevation),
      d.heroDistance * Math.cos(elevation) * Math.sin(bearing),
    ],
    target,
  };
}

/** a point along the valley `s` metres from its mouth, held to its two ends */
function along(points: readonly Vector[], spacing: number, s: number): Vector {
  const at = Math.min(points.length - 1, Math.max(0, s / spacing));
  const k = Math.min(points.length - 2, Math.floor(at));
  return mixVector(points[k], points[k + 1], at - k);
}

/** the highest ground under the path from `from` to `to` metres along it */
function highestBetween(
  points: readonly Vector[],
  spacing: number,
  from: number,
  to: number
): number {
  let highest = Math.max(along(points, spacing, from)[1], along(points, spacing, to)[1]);
  const first = Math.max(0, Math.ceil(from / spacing));
  const last = Math.min(points.length - 1, Math.floor(to / spacing));
  for (let k = first; k <= last; k++) {
    highest = Math.max(highest, points[k][1]);
  }
  return highest;
}

/** how far up the valley the pass goes: as far as it may, short of where it would look past the valley's head */
function passReach(valley: IValley, d: IDirection): number {
  const length = (valley.points.length - 1) * d.valleySpacing;
  return Math.min(d.passLength, Math.max(0, length - d.passLookAhead));
}

/** the pass `s` metres up the valley */
function passPose(valley: IValley, s: number, d: IDirection): IPose {
  const { points } = valley;
  const here = along(points, d.valleySpacing, s);
  const ahead = along(points, d.valleySpacing, s + d.passLookAhead);
  const floor = highestBetween(points, d.valleySpacing, s - d.passGuard, s + d.passLookAhead);
  return {
    eye: [here[0], floor + d.passClearance, here[2]],
    target: [ahead[0], ahead[1] + d.passTargetLift, ahead[2]],
  };
}

/**
 * from one pose to another round the vertical axis: the eye's distance from it, its bearing about it the short
 * way, and its height, each at its own share of the way, so a move can rise before it travels or after
 */
function swing(from: IPose, to: IPose, across: number, up: number, look: number): IPose {
  const radius = (v: Vector): number => Math.hypot(v[0], v[2]);
  const bearingOf = (v: Vector): number => Math.atan2(v[2], v[0]);
  let turn = bearingOf(to.eye) - bearingOf(from.eye);
  turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
  const r = mix(radius(from.eye), radius(to.eye), across);
  const b = bearingOf(from.eye) + turn * across;
  return {
    eye: [r * Math.cos(b), mix(from.eye[1], to.eye[1], up), r * Math.sin(b)],
    target: mixVector(from.target, to.target, look),
  };
}

/**
 * the camera at progress `p` and `e` seconds after the storm, over `valley`, turned by `by`. `vantage` is the
 * stage's high view, where the storm is watched from
 */
export function cameraAt(
  p: number,
  e: number,
  valley: IValley | null,
  by: ISteer,
  vantage: IPose,
  d: IDirection
): IPose {
  if (p < 1) {
    return stormPose(Math.max(0, p), vantage, d);
  }
  const hero = heroSeconds(d);
  if (e >= hero) {
    return orbitPose(e, by, d);
  }
  const start = stormPose(1, vantage, d);
  const shot = orbitPose(hero, UNSTEERED, d);
  if (valley === null || valley.points.length < 2) {
    const t = e / hero;
    return swing(start, shot, ease(0, 1, t), ease(0, 1, t), ease(0, 1, t));
  }
  const reach = passReach(valley, d);
  const mouth = passPose(valley, 0, d);
  if (e < d.descentSeconds) {
    const t = e / d.descentSeconds;
    return swing(start, mouth, ease(0, 0.7, t), ease(0.35, 1, t), ease(0, 1, t));
  }
  const passed = e - d.descentSeconds;
  if (passed < d.passSeconds) {
    return passPose(valley, reach * ease(0, d.passSeconds, passed), d);
  }
  const t = (passed - d.passSeconds) / d.settleSeconds;
  return swing(passPose(valley, reach, d), shot, ease(0.25, 1, t), ease(0, 0.5, t), ease(0, 1, t));
}
