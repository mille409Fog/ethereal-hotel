import {
  emptyProgress,
  parseProgress,
  serializeProgress,
  type GuestProgress,
} from './guest-progress';

const ids = (progress: GuestProgress): Record<string, string[]> =>
  Object.fromEntries(Object.entries(progress).map(([list, set]) => [list, [...set]]));

const EMPTY = { states: [], bonus: [], continents: [], countries: [] };

describe('parseProgress', () => {
  it('reads nothing stored as an empty record', () => {
    expect(ids(parseProgress(null))).toEqual(EMPTY);
  });

  it('reads anything that is not a record of lists as empty, without throwing', () => {
    for (const raw of ['', '{', 'null', '42', '"states"', '[]', '["CA"]']) {
      expect(ids(parseProgress(raw)), raw).toEqual(EMPTY);
    }
  });

  it('keeps only known places, each in the list it belongs to', () => {
    const raw = JSON.stringify({
      states: ['CA', 'DC', 'ZZ', 42, null, 'CA'],
      bonus: ['DC', 'CA'],
      continents: 'AF',
      countries: ['FR', 'TW', 'AQ'],
      extra: ['CA'],
    });

    expect(ids(parseProgress(raw))).toEqual({
      states: ['CA'],
      bonus: ['DC'],
      continents: [],
      countries: ['FR'],
    });
  });

  it('orders ids as places.data.ts does, whatever order they were stored in', () => {
    expect([...parseProgress(JSON.stringify({ states: ['WY', 'AL', 'MN'] })).states]).toEqual([
      'AL',
      'MN',
      'WY',
    ]);
  });
});

describe('serializeProgress', () => {
  it('round-trips through parseProgress', () => {
    const progress: GuestProgress = {
      ...emptyProgress(),
      states: new Set(['AK', 'HI']),
      bonus: new Set(['GU']),
    };
    expect(ids(parseProgress(serializeProgress(progress)))).toEqual(ids(progress));
  });

  it('writes all four lists, so an empty record is still a record', () => {
    expect(JSON.parse(serializeProgress(emptyProgress()))).toEqual(EMPTY);
  });
});
