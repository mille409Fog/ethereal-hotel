import { AUBADE_STATES } from '../solar/state';
import { PROJECTION_RIGS, projectionRigFor, type IProjectionRig } from './projection-rig';

/**
 * Floor −4's five hours.
 *
 * The library's and the cellar's suites have this shape and for the same reason:
 * these floors answer the sun with a single field and hold everything else constant,
 * and "everything else is constant" is a claim about five hand-written records that
 * will drift the first time somebody nudges one of them — invisibly, because a
 * projection box that is two per cent brighter at noon is a perfectly good
 * projection box.
 *
 * What is different here is what the moving field *is*. Floor −2's is a property of
 * the room and Floor −3's is a property of the visitor. Floor −4's is not a property
 * of anything in the frame: it is the rate at which the frame is replaced, which is
 * the one thing about a picture that a single picture cannot show.
 */

/** Every field the hour is not allowed to move. */
const CONSTANT_FIELDS = [
  'arcColour',
  'arcStrength',
  'exposure',
  'ambientFloor',
  'ambientSky',
  'dust',
] as const satisfies ReadonlyArray<keyof IProjectionRig>;

describe('the projection rigs', () => {
  it('dresses every hour of the sun', () => {
    for (const state of AUBADE_STATES) {
      expect(PROJECTION_RIGS[state]).toBeDefined();
      expect(PROJECTION_RIGS[state].state).toBe(state);
    }
  });

  it('lights the room identically at all five hours', () => {
    // The floor's whole architecture, asserted rather than trusted. The arc is the
    // same arc at astronomical night and at noon, in the same room, throwing the same
    // beam through the same port. If that ever stops being true, Floor −4 has quietly
    // become a fifth dimmer switch and the thing it was built to say has gone.
    const reference = PROJECTION_RIGS.open;

    for (const state of AUBADE_STATES) {
      for (const field of CONSTANT_FIELDS) {
        expect(PROJECTION_RIGS[state][field], `${state} moved ${field}`).toEqual(reference[field]);
      }
    }
  });

  it('slows the projector as the night ends', () => {
    // The one field the hour moves. Strictly falling rather than merely
    // non-increasing: two adjacent hours at the same rate would be two hours this
    // floor cannot tell apart, which is a room that has stopped keeping the hotel's
    // hours for two fifths of the day.
    const rates = AUBADE_STATES.map((state) => PROJECTION_RIGS[state].rate);

    for (let index = 1; index < rates.length; index += 1) {
      expect(
        rates[index],
        `${AUBADE_STATES[index]} runs no slower than ${AUBADE_STATES[index - 1]}`
      ).toBeLessThan(rates[index - 1]);
    }

    // Twenty-four at astronomical night, because that is the rate, and eighteen next
    // because that is silent speed rather than a number somebody liked.
    expect(rates[0]).toBe(24);
    expect(rates[1]).toBe(18);
  });

  it('stops the machine at noon, and stopped is the word', () => {
    // Not nearly stopped. A rate of half a frame a second is a machine that is
    // running, and a projector crawling through noon is this floor's argument
    // quietly becoming a gradient — the same failure `inkStrength` and `adaptation`
    // are held to exactly zero to avoid. `check:docs` holds this from the other side.
    expect(PROJECTION_RIGS.shuttered.rate).toBe(0);
  });

  it('burns only the frame that is standing still', () => {
    // Exactly 0 at every hour but the shuttered one, where it is exactly 1. A print
    // that is faintly alight at three in the morning is a different and much sillier
    // idea, and a burn on a ramp would make the daytime state a fifth point on a
    // dimmer rather than the second picture AUBADE asks for.
    for (const state of AUBADE_STATES) {
      const expected = state === 'shuttered' ? 1 : 0;
      expect(PROJECTION_RIGS[state].burn, `${state} burn`).toBe(expected);
    }
  });

  it('is the only room in the hotel lit by a cold light', () => {
    // Every other light in this building is gas, tungsten, tallow or the sun, and all
    // of them hold blue well below red. An arc runs near six thousand kelvin, and
    // this inequality is most of why the room reads as machinery rather than as
    // another warm interior four floors down.
    const [red, , blue] = PROJECTION_RIGS.open.arcColour;
    expect(blue).toBeGreaterThan(red);
  });

  it('carries its own exposure rather than riding the lobby’s', () => {
    // The library learned this the expensive way — `uExposure` is Floor 0's field and
    // the tonemap applies it to the whole frame — and down here it would move the
    // burn's *edge* rather than its brightness, which is a shape rather than a level.
    expect(PROJECTION_RIGS.open.exposure).toBeGreaterThan(0);
    expect(PROJECTION_RIGS.open.exposure).toBeLessThan(1.35);
  });
});

describe('reaching the projection box for an hour', () => {
  it('hands back the hour’s own rig, normally', () => {
    for (const state of AUBADE_STATES) {
      expect(projectionRigFor(state)).toBe(PROJECTION_RIGS[state]);
      expect(projectionRigFor(state, false)).toBe(PROJECTION_RIGS[state]);
    }
  });

  it('starts the machine for a visitor who let themselves in', () => {
    // AUBADE says the invitation "runs the full night piece", and it matters more
    // here than anywhere above: the shuttered state on this floor is a room in which
    // nothing is happening and nothing is going to, which is a fine second picture
    // and a poor only one.
    const opened = projectionRigFor('shuttered', true);

    expect(opened.rate).toBe(PROJECTION_RIGS.open.rate);
    expect(opened.burn).toBe(0);
    expect(opened.state).toBe('shuttered');
  });

  it('ignores the invitation at every hour that is already night', () => {
    for (const state of AUBADE_STATES) {
      if (state !== 'shuttered') {
        expect(projectionRigFor(state, true)).toBe(PROJECTION_RIGS[state]);
      }
    }
  });

  it('falls back to the open rig rather than handing back nothing', () => {
    // Never null: an unknown state reaching this would otherwise be a projection box
    // with undefined uniforms, which uploads as NaN and renders as black.
    const unknown = 'midwinter' as never;

    expect(projectionRigFor(unknown)).toBe(PROJECTION_RIGS.open);
    expect(projectionRigFor(unknown, true)).toBe(PROJECTION_RIGS.open);
  });
});
