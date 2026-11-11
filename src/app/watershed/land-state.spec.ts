import { LAND_SENTENCES, landStateFor, showsStoredLand } from './land-state';

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
});
