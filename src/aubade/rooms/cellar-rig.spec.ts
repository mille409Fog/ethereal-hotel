import { AUBADE_STATES } from '../solar/state';
import { CELLAR_RIGS, cellarRigFor, type ICellarRig } from './cellar-rig';

/**
 * Floor −3's five hours.
 *
 * The library's suite has the same shape as this one and for the same reason:
 * both floors answer the sun with a single field and hold everything else
 * constant, and "everything else is constant" is a claim about five hand-written
 * records that will drift the first time somebody nudges one of them. It is also
 * invisible when it drifts, because a cellar that is two per cent brighter at
 * noon is a perfectly good cellar.
 *
 * What is different here is what the moving field means. Floor −2's is a property
 * of the room — how much gilt is left on the spines. Floor −3's is a property of
 * the visitor: how far the dark will let their own eyes get, which is why it is
 * multiplied by a stillness this file knows nothing about.
 */

/** Every field the hour is not allowed to move. */
const CONSTANT_FIELDS = [
  'candleColour',
  'candleStrength',
  'exposure',
  'ambientFloor',
  'ambientSky',
  'dust',
] as const satisfies ReadonlyArray<keyof ICellarRig>;

describe('the cellar rigs', () => {
  it('dresses every hour of the sun', () => {
    for (const state of AUBADE_STATES) {
      expect(CELLAR_RIGS[state]).toBeDefined();
      expect(CELLAR_RIGS[state].state).toBe(state);
    }
  });

  it('lights the room identically at all five hours', () => {
    // The floor's whole architecture, asserted rather than trusted. Every light in
    // this room is the same at astronomical night and at noon; if that ever stops
    // being true, Floor −3 has quietly become a fourth dimmer switch and the thing
    // it was built to say has gone.
    const reference = CELLAR_RIGS.open;

    for (const state of AUBADE_STATES) {
      for (const field of CONSTANT_FIELDS) {
        expect(CELLAR_RIGS[state][field], `${state} moved ${field}`).toEqual(reference[field]);
      }
    }
  });

  it('narrows what stillness is worth as the night ends', () => {
    // The one field the hour moves, and it moves one way. A visitor arriving
    // nearer dawn has more of the day still in their eyes, so the same ninety
    // seconds buys less.
    const ceilings = AUBADE_STATES.map((state) => CELLAR_RIGS[state].adaptation);

    for (let index = 1; index < ceilings.length; index += 1) {
      expect(
        ceilings[index],
        `${AUBADE_STATES[index]} lets a visitor further in than ${AUBADE_STATES[index - 1]}`
      ).toBeLessThan(ceilings[index - 1]);
    }

    expect(ceilings[0]).toBe(1);
  });

  it('gives a daytime visitor exactly nothing, and exactly is the word', () => {
    // Not nearly nothing. A ceiling of 0.03 is a room that resolves very slightly,
    // which renders beautifully and has turned the floor's argument into a
    // gradient. `check:docs` holds this too, from the other side.
    expect(CELLAR_RIGS.shuttered.adaptation).toBe(0);
  });

  it('carries its own exposure rather than riding the lobby’s', () => {
    // The library learned this the expensive way: `uExposure` is Floor 0's field
    // and the tonemap applies it to the whole frame, so the lobby's daytime stop
    // was reaching underground. Down here it would be that mistake multiplied by
    // the adaptation gain.
    expect(CELLAR_RIGS.open.exposure).toBeGreaterThan(0);
    expect(CELLAR_RIGS.open.exposure).toBeLessThan(1.35);
  });
});

describe('reaching the cellar for an hour', () => {
  it('hands back the hour’s own rig, normally', () => {
    for (const state of AUBADE_STATES) {
      expect(cellarRigFor(state)).toBe(CELLAR_RIGS[state]);
      expect(cellarRigFor(state, false)).toBe(CELLAR_RIGS[state]);
    }
  });

  it('opens the room for a visitor who let themselves in', () => {
    // AUBADE says the invitation "runs the full night piece". The fiction and the
    // mechanism pull opposite ways here — a visitor who clicked the invitation
    // still has daylight in them — and the mechanism wins, because a floor that
    // stayed dark through the invitation is the one room the piece would withhold
    // from every visitor who arrives during office hours.
    const opened = cellarRigFor('shuttered', true);

    expect(opened.adaptation).toBe(CELLAR_RIGS.open.adaptation);
    expect(opened.state).toBe('shuttered');
  });

  it('ignores the invitation at every hour that is already night', () => {
    for (const state of AUBADE_STATES) {
      if (state !== 'shuttered') {
        expect(cellarRigFor(state, true)).toBe(CELLAR_RIGS[state]);
      }
    }
  });

  it('falls back to the open rig rather than handing back nothing', () => {
    // Never null: an unknown state reaching this would otherwise be a cellar with
    // undefined uniforms, which uploads as NaN and renders as black.
    const unknown = 'midwinter' as never;

    expect(cellarRigFor(unknown)).toBe(CELLAR_RIGS.open);
    expect(cellarRigFor(unknown, true)).toBe(CELLAR_RIGS.open);
  });
});
