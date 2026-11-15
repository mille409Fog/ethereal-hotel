import { CAMERA_POSITION, CAMERA_TARGET } from '../stage/stage-calibration';
import { cameraAt, heroSeconds, IPose, steer, steerable, UNSTEERED } from './camera-path';
import { DIRECTION } from './direction-calibration';
import { Vector } from './direction';
import { IValley } from './valley';

const d = DIRECTION;
const VANTAGE: IPose = { eye: CAMERA_POSITION, target: CAMERA_TARGET };
const HERO = heroSeconds(d);

/** a straight valley from the middle of the +x edge toward the centre, its floor rising 5 m in 80 */
const VALLEY: IValley = {
  points: Array.from({ length: 80 }, (_, k): Vector => [3950 - k * 80, 100 + k * 5, 0]),
};

const at = (p: number, e: number, valley: IValley | null = VALLEY, by = UNSTEERED): IPose =>
  cameraAt(p, e, valley, by, VANTAGE, d);

const distance = (a: Vector, b: Vector): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const elevation = (pose: IPose): number =>
  (Math.atan2(
    pose.eye[1] - pose.target[1],
    Math.hypot(pose.eye[0] - pose.target[0], pose.eye[2] - pose.target[2])
  ) *
    180) /
  Math.PI;

describe('the camera’s path', () => {
  it('starts exactly at the stage’s own vantage', () => {
    expect(at(0, 0)).toEqual(VANTAGE);
  });

  it('turns slowly round the block through the storm, at its height and distance', () => {
    const start = at(0, 0);
    const end = at(0.999999, 0);
    const radius = (v: Vector): number => Math.hypot(v[0], v[2]);

    expect(end.eye[1]).toBe(CAMERA_POSITION[1]);
    expect(radius(end.eye)).toBeCloseTo(radius(start.eye), 6);
    const turned =
      (Math.atan2(end.eye[2], end.eye[0]) - Math.atan2(start.eye[2], start.eye[0])) *
      (180 / Math.PI);
    expect(Math.abs(turned)).toBeCloseTo(d.stormArc, 3);
  });

  it('holds still through a paused storm, which is a storm whose progress does not move', () => {
    expect(at(0.4, 0)).toEqual(at(0.4, 30));
  });

  it('moves without a jump from the storm’s last frame into the descent', () => {
    expect(distance(at(0.9999999, 0).eye, at(1, 0).eye)).toBeLessThan(1);
  });

  it('comes down to the valley’s mouth, low, looking up it', () => {
    const mouth = at(1, d.descentSeconds);

    expect(mouth.eye[0]).toBeCloseTo(VALLEY.points[0][0], 6);
    expect(mouth.eye[1]).toBeLessThan(VALLEY.points[0][1] + d.passClearance + 200);
    expect(mouth.target[0]).toBeLessThan(mouth.eye[0]);
  });

  it('stays high until it is over the mouth, so it never comes low over ground it has not crossed', () => {
    const halfway = at(1, d.descentSeconds * 0.3);

    expect(halfway.eye[1]).toBeGreaterThan(CAMERA_POSITION[1] - 1);
  });

  it('flies up the valley and is always above the ground under it, by its clearance', () => {
    for (let k = 0; k <= 50; k++) {
      const pose = at(1, d.descentSeconds + (d.passSeconds * k) / 50);
      const under = 100 + ((3950 - pose.eye[0]) / 80) * 5;
      expect(pose.eye[1]).toBeGreaterThanOrEqual(under + d.passClearance - 1e-6);
      expect(pose.target[0]).toBeLessThan(pose.eye[0]);
    }
    const started = at(1, d.descentSeconds).eye[0];
    const ended = at(1, d.descentSeconds + d.passSeconds).eye[0];
    expect(started - ended).toBeCloseTo(Math.min(d.passLength, 79 * 80 - d.passLookAhead), 6);
  });

  it('rises before it travels out to the hero shot', () => {
    const passEnd = at(1, d.descentSeconds + d.passSeconds);
    const early = at(1, d.descentSeconds + d.passSeconds + d.settleSeconds * 0.25);

    expect(early.eye[1]).toBeGreaterThan(passEnd.eye[1] + 500);
    expect(Math.abs(early.eye[0] - passEnd.eye[0])).toBeLessThan(1e-6);
  });

  it('arrives at the hero shot: low, far off, and at the calibrated angle above the horizon', () => {
    const hero = at(1, HERO);

    expect(distance(hero.eye, hero.target)).toBeCloseTo(d.heroDistance, 6);
    expect(elevation(hero)).toBeCloseTo(d.heroElevation, 9);
    expect(distance(at(1, HERO - 1e-6).eye, hero.eye)).toBeLessThan(1e-3);
  });

  it('reaches the same hero shot at the same moment on a land with no valley', () => {
    expect(at(1, HERO, null)).toEqual(at(1, HERO));
    expect(distance(at(1, HERO - 1e-6, null).eye, at(1, HERO).eye)).toBeLessThan(1e-3);
    expect(at(1, 0, null)).toEqual(at(1, 0));
  });

  it('then orbits, slowly, at the same distance and height', () => {
    const later = at(1, HERO + 10);

    expect(distance(later.eye, later.target)).toBeCloseTo(d.heroDistance, 6);
    expect(later.eye[1]).toBeCloseTo(at(1, HERO).eye[1], 6);
    expect(later.eye).not.toEqual(at(1, HERO).eye);
  });

  it('lets the visitor turn it only once the orbit has begun', () => {
    expect(steerable(0.5, 0, d)).toBe(false);
    expect(steerable(1, HERO - 1, d)).toBe(false);
    expect(steerable(1, HERO, d)).toBe(true);
  });

  it('turns the orbit as far round as the visitor likes, and up and down only within bounds', () => {
    const turned = steer(UNSTEERED, 400, 1000, d);

    expect(turned.yaw).toBe(400);
    expect(elevation(at(1, HERO, VALLEY, turned))).toBeCloseTo(d.orbitHighest, 9);
    expect(elevation(at(1, HERO, VALLEY, steer(UNSTEERED, 0, -1000, d)))).toBeCloseTo(
      d.orbitLowest,
      9
    );
    expect(steer(steer(UNSTEERED, 10, 5, d), -10, -5, d)).toEqual(UNSTEERED);
  });

  it('pays the steer no mind before the orbit, so a turn cannot pull the camera off the pass', () => {
    const turned = steer(UNSTEERED, 90, 20, d);

    expect(at(1, d.descentSeconds + 5, VALLEY, turned)).toEqual(at(1, d.descentSeconds + 5));
    expect(at(0.5, 0, VALLEY, turned)).toEqual(at(0.5, 0));
  });
});
