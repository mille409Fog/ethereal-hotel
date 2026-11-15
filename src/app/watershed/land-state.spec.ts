import { LAND_SENTENCES, landLine, landStateFor, PAUSED, showsStoredLand } from './land-state';

describe('land state', () => {
  it('simulates when the device can and motion is allowed', () => {
    expect(landStateFor(false, true)).toBe('simulating');
  });

  it('shows the stored land when the device cannot render to float', () => {
    expect(landStateFor(false, false)).toBe('stored');
  });

  it('holds still under reduced motion, whatever the device could have done', () => {
    expect(landStateFor(true, true)).toBe('still');
    expect(landStateFor(true, false)).toBe('still');
  });

  it('counts the still frame as a stored land too, since that is what it is a frame of', () => {
    expect(showsStoredLand('simulating')).toBe(false);
    expect(showsStoredLand('still')).toBe(true);
    expect(showsStoredLand('stored')).toBe(true);
  });

  it('has a different sentence for each state', () => {
    const sentences = Object.values(LAND_SENTENCES);

    expect(new Set(sentences).size).toBe(3);
  });

  describe('the line on screen', () => {
    it('names the state and the seed', () => {
      expect(landLine('simulating', 77)).toBe(`${LAND_SENTENCES.simulating} Seed 77.`);
      expect(landLine('still', 4127)).toBe(`${LAND_SENTENCES.still} Seed 4127.`);
      expect(landLine('stored', 4127)).toBe(`${LAND_SENTENCES.stored} Seed 4127.`);
    });

    it('says when a running storm is paused, and nothing of the kind where none is running', () => {
      expect(landLine('simulating', 77, true)).toBe(
        `${LAND_SENTENCES.simulating} ${PAUSED} Seed 77.`
      );
      expect(landLine('still', 4127, true)).toBe(`${LAND_SENTENCES.still} Seed 4127.`);
    });

    it('never dresses the seed up: it is an address, and has to be typed back as it is shown', () => {
      expect(landLine('simulating', 3745710371)).toContain('Seed 3745710371.');
    });

    it('makes no claim about time', () => {
      for (const state of ['simulating', 'still', 'stored'] as const) {
        expect(landLine(state, 1, true)).not.toMatch(/year|hour|century|millenni/i);
      }
    });
  });
});
