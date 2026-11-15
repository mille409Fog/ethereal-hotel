/**
 * the storm's one clock: the rain, the weather, the sun and the plants, each a pure function of how far the storm
 * has got, `p` in [0, 1], and of seconds since it ended, `e`, which is 0 until then. the camera's path is the same
 * kind of function and is in `camera-path.ts`. the numbers are in `direction-calibration.ts`.
 *
 * - **the rain is counted in steps.** each step is given `rainAt` of its own place in the storm, so a device that
 *   falls behind the clock gets the same rain on the same step and makes the same land.
 * - **the rain stops before the storm does**, at `rainStop`, so the last steps drain the land and the rivers are at
 *   their base flow, not stopped mid-flood, when the light comes. it is exactly 0 from there to `p = 1`.
 * - **the cloud breaks after the storm, not when the rain stops.** the weather is overcast for the whole of `p`
 *   and clears over the first seconds of `e`, so the land is seen draining under the cloud that rained on it.
 * - **the sun moves only while the weather breaks.** a sun that moves has the light worked out again every
 *   frame; one that stands still costs nothing. so it stands still through the storm, where it is behind cloud
 *   anyway, and comes down to golden hour over `sunSeconds` and stays there.
 * - **every curve is flat at both ends**: each change is a smoothstep, so nothing the eye follows starts or
 *   stops with a jolt, and every curve's end points are exactly its calibrated values.
 *
 * the functions take the calibration as an argument rather than importing it, because Node imports this file
 * directly and a leaf may import nothing but types. see `model/fields.ts`.
 */
import type { IDirection } from './direction-calibration';

/** x, y, z, with y up */
export type Vector = readonly [number, number, number];

const DEGREES = 180 / Math.PI;

/** 0 at `from` and below, 1 at `to` and above, and a smoothstep between, flat at both ends */
export function ease(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** the share of the way from `a` to `b` */
export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** the unit vector toward a sun at a bearing round from +x toward +z and an elevation, both in degrees */
export function towardSun(bearing: number, elevation: number): Vector {
  const b = bearing / DEGREES;
  const h = elevation / DEGREES;
  return [Math.cos(h) * Math.cos(b), Math.sin(h), Math.cos(h) * Math.sin(b)];
}

/** the rain's strength, in [0, 1], at progress `p`: rises quickly, holds, eases off, and is 0 from `rainStop` */
export function rainAt(p: number, d: IDirection): number {
  if (p <= 0 || p >= d.rainStop) {
    return 0;
  }
  if (p < d.rainFull) {
    return ease(0, d.rainFull, p);
  }
  return p <= d.rainEase ? 1 : 1 - ease(d.rainEase, d.rainStop, p);
}

/** how clear the sky is, in [0, 1]: overcast for the whole storm, and clearing over the first seconds after */
export function weatherAt(p: number, e: number, d: IDirection): number {
  return p < 1 ? 0 : ease(0, d.clearSeconds, e);
}

/** toward the sun: where the storm's sun stands until the storm is over, then down to a low one */
export function sunAt(p: number, e: number, d: IDirection): Vector {
  const t = p < 1 ? 0 : ease(0, d.sunSeconds, e);
  return towardSun(
    mix(d.stormSunBearing, d.goldenSunBearing, t),
    mix(d.stormSunElevation, d.goldenSunElevation, t)
  );
}

/** how much of the plants the land's shader draws, in [0, 1]: none until the light has come */
export function greeningAt(e: number, d: IDirection): number {
  return ease(d.greenFrom, d.greenTo, e);
}
