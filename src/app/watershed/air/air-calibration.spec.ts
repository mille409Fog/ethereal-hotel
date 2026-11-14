import { LAND_LOOK } from '../land/land-calibration';
import { EROSION } from '../model/erosion-calibration';
import { CAMERA_FAR, CAMERA_POSITION } from '../stage/stage-calibration';
import { AIR_LOOK } from './air-calibration';
import { AIR_COLOURS, AIR_FLOATS, RAIN_COLOURS, RAIN_COUNTS, RAIN_FLOATS } from './air-shaders';

describe('air calibration', () => {
  it('has no number a shader does not read', () => {
    const read = new Set<string>([
      ...AIR_FLOATS,
      ...AIR_COLOURS,
      ...RAIN_FLOATS,
      ...RAIN_COUNTS,
      ...RAIN_COLOURS,
    ]);

    expect(Object.keys(AIR_LOOK).filter((key) => !read.has(key))).toEqual([]);
  });

  it('lays the deck below the rim and above the foot of the walls, so the walls go down into it', () => {
    // the rim of the block is at base level: every land is raised from it
    expect(AIR_LOOK.deckHeight + AIR_LOOK.deckSoft).toBeLessThan(EROSION.baseLevel);
    expect(AIR_LOOK.deckHeight).toBeGreaterThan(LAND_LOOK.skirtFloor);
    expect(AIR_LOOK.deckSoft).toBeGreaterThan(0);
  });

  it('stands the clouds above the highest land by more than the land’s relief', () => {
    const highest = EROSION.baseLevel + EROSION.relief;

    expect(AIR_LOOK.cloudHeight - highest).toBeGreaterThan(EROSION.relief);
  });

  it('thickens the haze in a storm', () => {
    expect(AIR_LOOK.hazeStorm).toBeGreaterThan(AIR_LOOK.hazeClear);
    expect(AIR_LOOK.hazeClear).toBeGreaterThan(0);
  });

  it('takes more of the blue than of the red out of the sun, so a low sun is a warm one', () => {
    const [red, green, blue] = AIR_LOOK.sunExtinction;

    expect(red).toBeLessThan(green);
    expect(green).toBeLessThan(blue);
  });

  it('reaches the deck far past the block, and has it gone into the sky before the camera loses it', () => {
    // the deck is wholly faded at nine tenths of its reach (air-shaders.ts); past the far plane it is not drawn
    const fromCamera = Math.hypot(...CAMERA_POSITION);

    expect(AIR_LOOK.deckReach).toBeGreaterThan(EROSION.extent * 4);
    expect(0.9 * AIR_LOOK.deckReach + fromCamera).toBeLessThan(CAMERA_FAR);
  });

  it('counts its sheets of rain in whole numbers, which is what a loop can run', () => {
    for (const key of RAIN_COUNTS) {
      expect(Number.isInteger(AIR_LOOK[key])).toBe(true);
      expect(AIR_LOOK[key]).toBeGreaterThan(0);
    }
  });
});
