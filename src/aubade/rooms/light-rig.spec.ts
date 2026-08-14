import { AUBADE_STATES } from '../solar/state';
import { INVITED_THRESHOLD, LIGHT_RIGS, rigFor } from './light-rig';

/**
 * The five rigs.
 *
 * These are numbers chosen by eye, so most of what could be asserted about them
 * would be a restatement rather than a test. What is worth holding is the shape:
 * that there is a rig for every hour, that the key directions actually point
 * where the shader assumes they do, and that the invitation does what AUBADE
 * says it does — runs the full night piece, with one mark.
 *
 * Whether the pictures are any good is `npm run verify:shader`'s business, and
 * ultimately nobody's but a person looking at them.
 */

describe('the light rigs', () => {
  it('dresses every hour of the sun', () => {
    // `rigFor` indexes this. A missing entry is an unlit room.
    for (const state of AUBADE_STATES) {
      expect(LIGHT_RIGS[state]).toBeDefined();
      expect(LIGHT_RIGS[state].state).toBe(state);
    }
  });

  it('hands the shader unit vectors', () => {
    // The shader treats `uKeyDirection` as normalised in four places — the
    // aperture walk, the desk's slab test, the shadow march and the facing term
    // — and none of them normalises it. A vector 5% long here is a beam that
    // lands 5% short of where the comment says, which is unfindable from the
    // picture.
    for (const state of AUBADE_STATES) {
      const { x, y, z } = LIGHT_RIGS[state].keyDirection;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4);
    }
  });

  it('sends the light downwards and into the room, at every hour', () => {
    // The transom is above head height in the back wall, and the camera is in
    // front of it. Light travelling up, or away from the viewer, lights only
    // surfaces nobody can see — the mistake the shader's file comment records
    // as having taken three attempts to find.
    for (const state of AUBADE_STATES) {
      const { y, z } = LIGHT_RIGS[state].keyDirection;
      expect(y, `${state} sends its key light upwards`).toBeLessThan(0);
      expect(z, `${state} sends its key light away from the camera`).toBeLessThan(0);
    }
  });

  it('leaves the daylight under the door for the invitation to draw', () => {
    // No honest hour has it. It is a mark, not a state.
    for (const state of AUBADE_STATES) {
      expect(LIGHT_RIGS[state].threshold).toBe(0);
    }
  });

  it('puts the shutter down in daylight and nowhere else', () => {
    for (const state of AUBADE_STATES) {
      expect(LIGHT_RIGS[state].shutter).toBe(state === 'shuttered' ? 1 : 0);
    }
  });

  it('turns the desk lamp off in daylight and leaves it burning otherwise', () => {
    // A lamp left on at noon is a set-dressing error, and switching it off is
    // most of what makes the day read as day.
    expect(LIGHT_RIGS.shuttered.lampStrength).toBe(0);
    for (const state of AUBADE_STATES) {
      if (state !== 'shuttered') {
        expect(LIGHT_RIGS[state].lampStrength).toBeGreaterThan(0);
      }
    }
  });
});

describe('rigFor', () => {
  it('returns the hour’s own rig when nobody let themselves in', () => {
    for (const state of AUBADE_STATES) {
      expect(rigFor(state)).toBe(LIGHT_RIGS[state]);
      expect(rigFor(state, false)).toBe(LIGHT_RIGS[state]);
    }
  });

  it('runs the full night piece for a visitor who did', () => {
    // AUBADE is explicit: taking the invitation runs the night piece, not a
    // compromise between day and night and not a dimmed version of either.
    const invited = rigFor('shuttered', true);

    expect(invited.shutter).toBe(0);
    expect(invited.bleach).toBe(0);
    expect(invited.keyColour).toEqual(LIGHT_RIGS.open.keyColour);
    expect(invited.lampStrength).toBe(LIGHT_RIGS.open.lampStrength);
  });

  it('leaves one mark, and remembers which hour it was really', () => {
    const invited = rigFor('shuttered', true);

    expect(invited.threshold).toBe(INVITED_THRESHOLD);
    // The rig still names the hour the visitor actually arrived in, so anything
    // reading it downstream is not told a comfortable story.
    expect(invited.state).toBe('shuttered');
  });

  it('does nothing at an hour the hotel opens by itself', () => {
    // The visitor who took the invitation at four in the afternoon is still on
    // the page at sunset. From that moment the night is theirs by right rather
    // than by request, and marking their floor with daylight would be a lie
    // about their hour.
    for (const state of AUBADE_STATES) {
      if (state === 'shuttered') continue;
      expect(rigFor(state, true), `${state} should ignore the invitation`).toBe(LIGHT_RIGS[state]);
    }
  });

  it('falls back to the open rig rather than to nothing', () => {
    // Not reachable through the type system, and entirely reachable through a
    // renamed state or a stale build. An unlit room is a worse answer than the
    // wrong hour.
    const nonsense = 'twilight-of-the-gods' as never;

    expect(rigFor(nonsense)).toBe(LIGHT_RIGS.open);
  });
});
