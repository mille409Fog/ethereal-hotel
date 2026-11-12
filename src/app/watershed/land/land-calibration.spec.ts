import { ILandLook, LAND_LOOK, sunDirection } from './land-calibration';
import { LAND_COLOURS, LAND_FLOATS, LIGHT_COUNTS, LIGHT_FLOATS } from './land-shaders';

describe('land calibration', () => {
  it('points at the sun with a unit vector, as high as its elevation says', () => {
    const [x, y, z] = sunDirection(LAND_LOOK);

    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    expect(y).toBeCloseTo(Math.sin((LAND_LOOK.sunElevation * Math.PI) / 180), 12);
  });

  it('measures the sun’s bearing round from +x toward +z', () => {
    const low: ILandLook = { ...LAND_LOOK, sunElevation: 0 };

    expect(sunDirection({ ...low, sunBearing: 0 })[0]).toBeCloseTo(1, 12);
    expect(sunDirection({ ...low, sunBearing: 90 })[2]).toBeCloseTo(1, 12);
  });

  it('keeps an afternoon sun: up, but lower than it is high', () => {
    expect(LAND_LOOK.sunElevation).toBeGreaterThan(0);
    expect(LAND_LOOK.sunElevation).toBeLessThan(45);
  });

  it('has no number a shader does not read', () => {
    // the sun's two angles reach the shaders as one vector
    const read = new Set<string>([
      ...LIGHT_FLOATS,
      ...LIGHT_COUNTS,
      ...LAND_FLOATS,
      ...LAND_COLOURS,
      'sunBearing',
      'sunElevation',
    ]);

    expect(Object.keys(LAND_LOOK).filter((key) => !read.has(key))).toEqual([]);
  });

  it('counts its looks in whole numbers, which is what a loop can run', () => {
    for (const key of LIGHT_COUNTS) {
      expect(Number.isInteger(LAND_LOOK[key])).toBe(true);
      expect(LAND_LOOK[key]).toBeGreaterThan(0);
    }
  });
});
