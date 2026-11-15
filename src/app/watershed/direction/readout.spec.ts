import { EROSION } from '../model/erosion-calibration';
import { depth, IReadout, readoutDigest, readoutRows, UNREAD, volume, volumesOf } from './readout';

const READ: IReadout = {
  steps: 4200,
  total: 12000,
  rain: 0.6123,
  moved: 5.75e8,
  exported: 3.634e8,
};

describe('the readout', () => {
  it('turns the land’s sums into volumes on the block’s own cells', () => {
    // a 4 grid on the 8 km block: each cell is two kilometres square
    const { moved, exported } = volumesOf([10, 3, 99, 2], 4, EROSION);

    expect(moved).toBe(10 * 4e6);
    expect(exported).toBe(5 * 4e6);
  });

  it('counts as carried off only what was cut and is no longer on the block, and never less than none', () => {
    expect(volumesOf([1, 0.6, 0, 0.4000001], 4, EROSION).exported).toBe(0);
  });

  it('says a volume in three figures, in millions or billions past a million', () => {
    expect(volume(5.754e8)).toBe('575 million m³');
    expect(volume(1.2345e9)).toBe('1.23 billion m³');
    expect(volume(4321.4)).toBe('4,321 m³');
  });

  it('says a depth of rain to the centimetre', () => {
    expect(depth(0.6123)).toBe('0.61 m');
    expect(depth(0)).toBe('0.00 m');
  });

  it('shows the steps, the rain and the two volumes, in that order', () => {
    expect(readoutRows(READ)).toEqual([
      ['Step', '4,200 of 12,000'],
      ['Rain', '0.61 m'],
      ['Rock moved', '575 million m³'],
      ['Carried off', '363 million m³'],
    ]);
  });

  it('says it has not read the land yet rather than showing a zero it did not measure', () => {
    const rows = readoutRows({ ...READ, moved: null, exported: null });

    expect(rows[2][1]).toBe(UNREAD);
    expect(rows[3][1]).toBe(UNREAD);
  });

  it('is one sentence for a screen reader, with the volumes only once they have been read', () => {
    expect(readoutDigest(READ)).toBe(
      'Step 4,200 of 12,000; 0.61 m of rain. 575 million m³ of rock moved, 363 million m³ carried off the block.'
    );
    expect(readoutDigest({ ...READ, moved: null, exported: null })).toBe(
      'Step 4,200 of 12,000; 0.61 m of rain.'
    );
  });

  it('makes no claim about time', () => {
    expect(readoutDigest(READ)).not.toMatch(/year|hour|century|millenni/i);
  });
});
