import { sunDirection, LAND_LOOK } from '../land/land-calibration';
import { DIRECTION } from './direction-calibration';
import { ease, greeningAt, rainAt, sunAt, towardSun, weatherAt } from './direction';

const d = DIRECTION;

/** `count + 1` evenly spaced points from `from` to `to`, both included */
const across = (from: number, to: number, count = 200): number[] =>
  Array.from({ length: count + 1 }, (_, k) => from + ((to - from) * k) / count);

const rising = (values: number[]): boolean => values.every((v, k) => k === 0 || v >= values[k - 1]);
const falling = (values: number[]): boolean =>
  values.every((v, k) => k === 0 || v <= values[k - 1]);

const elevationOf = (v: readonly number[]): number => (Math.asin(v[1]) * 180) / Math.PI;

describe('the storm’s clock', () => {
  describe('ease', () => {
    it('is exactly 0 and 1 at and past its ends, and rises between', () => {
      expect(ease(2, 4, 2)).toBe(0);
      expect(ease(2, 4, -5)).toBe(0);
      expect(ease(2, 4, 4)).toBe(1);
      expect(ease(2, 4, 9)).toBe(1);
      expect(ease(2, 4, 3)).toBe(0.5);
      expect(rising(across(2, 4).map((x) => ease(2, 4, x)))).toBe(true);
    });
  });

  describe('the rain', () => {
    it('is exactly 0 at the end of the storm', () => {
      expect(rainAt(1, d)).toBe(0);
    });

    it('is 0 at the start, and from `rainStop` to the end, so the last steps drain the land', () => {
      expect(rainAt(0, d)).toBe(0);
      for (const p of across(d.rainStop, 1)) {
        expect(rainAt(p, d)).toBe(0);
      }
    });

    it('rises quickly to full, holds there, and eases off', () => {
      expect(rising(across(0, d.rainFull).map((p) => rainAt(p, d)))).toBe(true);
      for (const p of across(d.rainFull, d.rainEase)) {
        expect(rainAt(p, d)).toBe(1);
      }
      expect(falling(across(d.rainEase, d.rainStop).map((p) => rainAt(p, d)))).toBe(true);
      expect(d.rainFull).toBeLessThan(0.1);
    });

    it('stops at about 0.85 of the storm, as the plan asks', () => {
      expect(d.rainStop).toBeCloseTo(0.85, 2);
    });

    it('never falls outside [0, 1]', () => {
      for (const p of across(-0.5, 1.5, 400)) {
        expect(rainAt(p, d)).toBeGreaterThanOrEqual(0);
        expect(rainAt(p, d)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('the weather', () => {
    it('is overcast for the whole storm, whatever the seconds say', () => {
      for (const p of across(0, 0.999)) {
        expect(weatherAt(p, 0, d)).toBe(0);
        expect(weatherAt(p, 100, d)).toBe(0);
      }
    });

    it('clears over the first seconds after the storm, and stays clear', () => {
      expect(weatherAt(1, 0, d)).toBe(0);
      expect(rising(across(0, d.clearSeconds).map((e) => weatherAt(1, e, d)))).toBe(true);
      expect(weatherAt(1, d.clearSeconds, d)).toBe(1);
      expect(weatherAt(1, 1000, d)).toBe(1);
    });
  });

  describe('the sun', () => {
    it('stands where the land was calibrated to be lit from, all through the storm', () => {
      const calibrated = sunDirection(LAND_LOOK);
      for (const p of [0, 0.5, 0.999]) {
        const sun = sunAt(p, 0, d);
        for (let k = 0; k < 3; k++) {
          expect(sun[k]).toBeCloseTo(calibrated[k], 12);
        }
      }
    });

    it('comes down to golden hour after the storm, and only down', () => {
      const elevations = across(0, d.sunSeconds).map((e) => elevationOf(sunAt(1, e, d)));

      expect(elevations[0]).toBeCloseTo(d.stormSunElevation, 9);
      expect(elevations[elevations.length - 1]).toBeCloseTo(d.goldenSunElevation, 9);
      expect(falling(elevations)).toBe(true);
      expect(d.goldenSunElevation).toBeLessThan(d.stormSunElevation);
    });

    it('then stands still, so the light is not worked out again', () => {
      expect(sunAt(1, d.sunSeconds, d)).toEqual(sunAt(1, d.sunSeconds + 60, d));
    });

    it('is a unit vector pointing up', () => {
      for (const e of across(0, d.sunSeconds, 20)) {
        const [x, y, z] = sunAt(1, e, d);
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
        expect(y).toBeGreaterThan(0);
      }
    });

    it('turns bearing and elevation into a direction the way the land’s calibration does', () => {
      expect(towardSun(LAND_LOOK.sunBearing, LAND_LOOK.sunElevation)).toEqual(
        sunDirection(LAND_LOOK)
      );
    });
  });

  describe('the plants', () => {
    it('are none through the storm and until the light has come', () => {
      expect(greeningAt(0, d)).toBe(0);
      expect(greeningAt(d.greenFrom, d)).toBe(0);
      expect(d.greenFrom).toBeGreaterThan(0);
    });

    it('come in after the cloud breaks, and are whole by `greenTo`', () => {
      expect(rising(across(d.greenFrom, d.greenTo).map((e) => greeningAt(e, d)))).toBe(true);
      expect(greeningAt(d.greenTo, d)).toBe(1);
      expect(greeningAt(d.greenTo + 100, d)).toBe(1);
    });
  });
});
