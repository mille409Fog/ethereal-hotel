import {
  LAND_PICTURES,
  LAND_SENTENCES,
  landLine,
  landPicture,
  landStateFor,
  NO_PICTURE,
  PAUSED,
  pausable,
  showsStoredLand,
  UNLOADED,
} from './land-state';

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

  describe("the canvas's name", () => {
    it('says what each state draws, differently for each', () => {
      expect(landPicture('simulating', false)).toBe(LAND_PICTURES.simulating);
      expect(landPicture('still', false)).toBe(LAND_PICTURES.still);
      expect(landPicture('stored', false)).toBe(LAND_PICTURES.stored);
      expect(new Set(Object.values(LAND_PICTURES)).size).toBe(3);
    });

    it('claims no land before one is drawn, or when the stored one failed to load', () => {
      expect(landPicture(null, false)).toBe(NO_PICTURE);
      expect(landPicture('still', true)).toBe(NO_PICTURE);
      expect(landPicture('stored', true)).toBe(NO_PICTURE);
    });

    it('makes no claim about time either', () => {
      for (const picture of [...Object.values(LAND_PICTURES), NO_PICTURE]) {
        expect(picture).not.toMatch(/year|hour|century|millenni/i);
      }
    });
  });

  describe('the line on screen', () => {
    it('names the state and the seed', () => {
      expect(landLine('simulating', 77)).toBe(`${LAND_SENTENCES.simulating} Seed 77.`);
      expect(landLine('still', 4127)).toBe(`${LAND_SENTENCES.still} Seed 4127.`);
      expect(landLine('stored', 4127)).toBe(`${LAND_SENTENCES.stored} Seed 4127.`);
    });

    it('says when a storm or a stored land’s pass is paused, and nothing of the kind of a still frame', () => {
      expect(landLine('simulating', 77, true)).toBe(
        `${LAND_SENTENCES.simulating} ${PAUSED} Seed 77.`
      );
      expect(landLine('stored', 4127, true)).toBe(`${LAND_SENTENCES.stored} ${PAUSED} Seed 4127.`);
      expect(landLine('still', 4127, true)).toBe(`${LAND_SENTENCES.still} Seed 4127.`);
      expect(pausable('still')).toBe(false);
    });

    it('says of both stored states that the land was computed earlier by the same model', () => {
      for (const state of ['still', 'stored'] as const) {
        expect(LAND_SENTENCES[state]).toContain('computed earlier by the same model');
      }
      expect(LAND_SENTENCES.simulating).not.toContain('earlier');
    });

    it('names no land when the stored one could not be loaded', () => {
      expect(UNLOADED).not.toMatch(/Seed/);
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
