import { EROSION } from '../model/erosion-calibration';
import { LAND_LOOK } from '../land/land-calibration';
import { IWaterLook, ripplePhase, WATER_LOOK } from './water-calibration';
import { WATER_COLOURS, WATER_FLOATS } from './water-shaders';

describe('water calibration', () => {
  it('has no number the water does not read', () => {
    // the two halves of the polygon offset are the material's, not a uniform's
    const read = new Set<string>([
      ...WATER_FLOATS,
      ...WATER_COLOURS,
      'offsetFactor',
      'offsetUnits',
    ]);

    expect(Object.keys(WATER_LOOK).filter((key) => !read.has(key))).toEqual([]);
  });

  it('brings water in over a range of depth, from above nothing', () => {
    expect(WATER_LOOK.waterFrom).toBeGreaterThan(0);
    expect(WATER_LOOK.waterFull).toBeGreaterThan(WATER_LOOK.waterFrom);
  });

  it('leaves a film to the wet ground: water is drawn from deeper than ground is wholly wet', () => {
    expect(WATER_LOOK.waterFrom).toBeGreaterThan(LAND_LOOK.wetDepth);
    // and the ground is wet under less than the model calls water worth a velocity
    expect(LAND_LOOK.wetDepth).toBeGreaterThan(EROSION.dryDepth);
  });

  it('draws the water nearer than it is, never further', () => {
    expect(WATER_LOOK.offsetFactor).toBeLessThan(0);
    expect(WATER_LOOK.offsetUnits).toBeLessThan(0);
  });

  it('carries the ripples through one period and starts again', () => {
    const look: IWaterLook = { ...WATER_LOOK, ripplePeriod: 4 };

    expect(ripplePhase(0, look)).toBe(0);
    expect(ripplePhase(1, look)).toBeCloseTo(0.25, 12);
    expect(ripplePhase(4, look)).toBe(0);
    expect(ripplePhase(4003, look)).toBeCloseTo(0.75, 9);
  });

  it('keeps the phase in [0, 1) at any time a frame can have', () => {
    for (const seconds of [0, 0.016, 3.999, 4, 86_400.5, 1e7]) {
      const phase = ripplePhase(seconds, WATER_LOOK);

      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});
