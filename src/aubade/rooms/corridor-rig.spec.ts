import { AUBADE_STATES } from '../solar/state';
import { CORRIDOR_RIGS, corridorRigFor } from './corridor-rig';
import { LIGHT_RIGS } from './light-rig';

/**
 * Floor −1's five hours.
 *
 * The lobby's rigs are checked by rendering them — `verify-shader.mjs` asserts the
 * five frames brighten in the order the sun does, which is a claim about pictures
 * and belongs in a browser. The corridor's central claim is the opposite one and
 * is *not* about brightness: the room has no window, so what the sun does to it is
 * turn its own lamps down, and the frames get darker for three states and then
 * lighter again when the day arrives down the lift shaft. That curve has no useful
 * ordering in luma, but the thing underneath it — the gas going out and staying
 * out — is exact, and exact claims belong here rather than in a rendered
 * approximation of themselves.
 */

/** The rigs in the order the sun walks them, darkest hour first. */
const inSolarOrder = AUBADE_STATES.map((state) => CORRIDOR_RIGS[state]);

describe('the corridor’s light rig', () => {
  describe('it answers to the same clock as the lobby', () => {
    it('has a rig for every state the sun can be in', () => {
      for (const state of AUBADE_STATES) {
        expect(CORRIDOR_RIGS[state]).toBeDefined();
        expect(CORRIDOR_RIGS[state].state).toBe(state);
      }
    });

    it('covers exactly the states the lobby covers, and no others', () => {
      // Two rooms, one clock. A state that exists on one floor and not the other
      // is AUBADE's first failure mode — a demo reel with a hotel painted on —
      // arriving quietly, one room at a time.
      expect(Object.keys(CORRIDOR_RIGS).sort()).toEqual(Object.keys(LIGHT_RIGS).sort());
    });
  });

  describe('the gas goes out as the night ends', () => {
    it('never turns the sconces up as the sun comes up', () => {
      // The corridor's whole relationship with the clock, as one assertion.
      // AUBADE's description of `late` is "rooms begin closing behind you, lights
      // go out in the order you are not looking"; this is that, monotonically.
      for (let index = 1; index < inSolarOrder.length; index += 1) {
        expect(inSolarOrder[index].sconceStrength).toBeLessThan(
          inSolarOrder[index - 1].sconceStrength
        );
      }
    });

    it('has them full at astronomical night and out at noon', () => {
      expect(CORRIDOR_RIGS.open.sconceStrength).toBeGreaterThan(1);
      expect(CORRIDOR_RIGS.shuttered.sconceStrength).toBe(0);
    });

    it('runs the opposite way to the lobby', () => {
      // The discriminating test, and the one that would catch the corridor being
      // wired to the lobby's rig by mistake — which would look entirely fine.
      const gasFell = CORRIDOR_RIGS.shuttered.sconceStrength < CORRIDOR_RIGS.open.sconceStrength;
      const skyRose = LIGHT_RIGS.shuttered.keyStrength > LIGHT_RIGS.open.keyStrength;

      expect(gasFell).toBe(true);
      expect(skyRose).toBe(true);
    });
  });

  describe('the day comes down the lift shaft', () => {
    it('lets nothing down it while the sun is properly below the horizon', () => {
      for (const state of ['open', 'late', 'warning'] as const) {
        expect(CORRIDOR_RIGS[state].shaftStrength).toBe(0);
      }
    });

    it('opens it at civil twilight and holds it open through the day', () => {
      expect(CORRIDOR_RIGS.aubade.shaftStrength).toBeGreaterThan(0);
      expect(CORRIDOR_RIGS.shuttered.shaftStrength).toBeGreaterThan(
        CORRIDOR_RIGS.aubade.shaftStrength
      );
    });

    it('brings the horizon down before it brings the day', () => {
      // At civil twilight what arrives is the colour of the horizon; at noon it is
      // daylight. A rose blade and a white one are the difference between the hour
      // the hotel is named for and the hour it is shut.
      const [red, green, blue] = CORRIDOR_RIGS.aubade.shaftColour;
      expect(red).toBeGreaterThan(green);
      expect(green).toBeGreaterThan(blue);

      const day = CORRIDOR_RIGS.shuttered.shaftColour;
      expect(Math.max(...day) - Math.min(...day)).toBeLessThan(0.15);
    });

    it('aims it down and towards the visitor, never back up the shaft', () => {
      // The direction the light *travels*, not the direction of the sun. Down and
      // out of the far wall, or the blade lands somewhere nobody standing in the
      // corridor can see — the same mistake the lobby's key light comment records.
      for (const rig of inSolarOrder) {
        expect(rig.shaftDirection.y).toBeLessThan(0);
        expect(rig.shaftDirection.z).toBeLessThan(0);
      }
    });

    it('keeps the aim unit length, whatever the hour', () => {
      for (const rig of inSolarOrder) {
        const { x, y, z } = rig.shaftDirection;
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4);
      }
    });
  });

  describe('the invitation reaches down here too', () => {
    it('gives an invited visitor the corridor at astronomical night', () => {
      // AUBADE says the invitation "runs the full night piece". A visitor who let
      // themselves in upstairs and then took the lift down gets the night corridor,
      // not a basement with the sun in it.
      const invited = corridorRigFor('shuttered', true);

      expect(invited.sconceStrength).toBe(CORRIDOR_RIGS.open.sconceStrength);
      expect(invited.shaftStrength).toBe(0);
    });

    it('leaves the mark upstairs where it was left', () => {
      // The invitation's mark is a line of daylight under the lobby's door, one
      // floor up. There is no door to the street down here and nothing for it to
      // come under, so the corridor's rig has no threshold at all — and the fact
      // that this rig has no such field is the assertion.
      expect(corridorRigFor('shuttered', true)).not.toHaveProperty('threshold');
    });

    it('ignores the invitation at every hour the hotel opens by itself', () => {
      for (const state of ['open', 'late', 'warning', 'aubade'] as const) {
        expect(corridorRigFor(state, true)).toEqual(CORRIDOR_RIGS[state]);
        expect(corridorRigFor(state, false)).toEqual(CORRIDOR_RIGS[state]);
      }
    });
  });
});
