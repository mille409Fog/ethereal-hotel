import { AUBADE_STATES } from '../solar/state';
import { BOX_RIGS, boxRigFor } from './box-rig';

/**
 * Floor −5's five hours.
 *
 * The rig is a table, so most of what is worth asserting about it is a shape rather
 * than a value — and on this floor one of those shapes is the floor itself. `house`
 * is the only field the sun moves, it is a length in metres rather than a weight,
 * and it reaches exactly zero at noon. Everything else in the table is meant to be
 * identical five times over, which is the sort of claim that survives right up until
 * somebody "tidies" it.
 */

describe('the house', () => {
  it('closes in as the night ends', () => {
    const depths = AUBADE_STATES.map((state) => BOX_RIGS[state].house);

    for (let i = 1; i < depths.length; i += 1) {
      expect(depths[i]).toBeLessThan(depths[i - 1]);
    }
  });

  it('is exactly zero at noon, not nearly zero', () => {
    // `toBe`, not `toBeCloseTo`, and the distinction is the floor. A house 20mm deep
    // is a house: the shader's `uHouse > 0.0` branch takes the auditorium side, the
    // chandelier is placed in a slot too shallow to hold it, and Floor −5's answer to
    // the sun has quietly become a gradient at the one hour it is about.
    expect(BOX_RIGS.shuttered.house).toBe(0);
  });

  it('is a length, and a room-sized one', () => {
    // Metres, not a weight in [0, 1] — which is what makes this floor's answer a
    // different kind of answer from the three above it that go to zero at dawn.
    expect(BOX_RIGS.open.house).toBeGreaterThan(20);
  });
});

describe('the light', () => {
  it('does not move at any hour', () => {
    // Seven of the eight fields are identical, character for character, in all five
    // rigs. That is the claim the file is written to make and it is the one a reader
    // is most likely to doubt, because the five frames plainly differ — so it is
    // asserted here as well as in the shader gate.
    const [first] = AUBADE_STATES;

    for (const state of AUBADE_STATES) {
      const rig = BOX_RIGS[state];
      expect(rig.chandelierColour).toEqual(BOX_RIGS[first].chandelierColour);
      expect(rig.chandelierStrength).toBe(BOX_RIGS[first].chandelierStrength);
      expect(rig.librettoColour).toEqual(BOX_RIGS[first].librettoColour);
      expect(rig.librettoStrength).toBe(BOX_RIGS[first].librettoStrength);
      expect(rig.exposure).toBe(BOX_RIGS[first].exposure);
      expect(rig.ambientFloor).toEqual(BOX_RIGS[first].ambientFloor);
      expect(rig.ambientSky).toEqual(BOX_RIGS[first].ambientSky);
      expect(rig.dust).toBe(BOX_RIGS[first].dust);
    }
  });

  it('keeps a lamp burning at every hour, including noon', () => {
    // The libretto lamp is the whole of the shuttered state's picture. A floor whose
    // daytime state is an unlit room has failed AUBADE's standing requirement that
    // every shuttered state be a second picture rather than a dark one.
    for (const state of AUBADE_STATES) {
      expect(BOX_RIGS[state].librettoStrength).toBeGreaterThan(0);
    }
  });
});

describe('every hour', () => {
  it('names itself', () => {
    for (const state of AUBADE_STATES) {
      expect(BOX_RIGS[state].state).toBe(state);
    }
  });

  it('has a rig', () => {
    for (const state of AUBADE_STATES) {
      expect(boxRigFor(state)).toBeDefined();
    }
  });
});

describe('the invitation', () => {
  it('opens the house for a visitor who let themselves in', () => {
    // AUBADE says the invitation "runs the full night piece", and it matters more on
    // this floor than on any above it: everywhere else a daytime visitor who declines
    // still gets a room with something in it, and here they get a cupboard.
    expect(boxRigFor('shuttered', true).house).toBe(BOX_RIGS.open.house);
  });

  it('leaves the state naming the real hour', () => {
    // The rig is the night's, the label is the truth. Same shape as the five floors
    // above, and it is what lets the plate say the hour was not yours.
    expect(boxRigFor('shuttered', true).state).toBe('shuttered');
  });

  it('changes nothing at an hour that is already dark', () => {
    for (const state of AUBADE_STATES) {
      if (state === 'shuttered') continue;
      expect(boxRigFor(state, true)).toBe(BOX_RIGS[state]);
    }
  });
});
