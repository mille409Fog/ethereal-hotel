import { COLOURS, IColour } from './gallery.data';
import { offerColours, Random, recommend } from './recommend';

/** A source that replays `values` in order, then repeats the last one. */
function sequence(...values: number[]): Random {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

/** A seeded linear congruential source, for checks that need many draws. */
function seeded(seed: number): Random {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

const blue = COLOURS.find((colour) => colour.id === 'blue') as IColour;

describe('offerColours', () => {
  it('returns the requested number of distinct colours from the collection', () => {
    const offered = offerColours(COLOURS, 5, seeded(1));
    expect(offered.length).toBe(5);
    expect(new Set(offered.map((colour) => colour.id)).size).toBe(5);
    for (const colour of offered) {
      expect(COLOURS).toContain(colour);
    }
  });

  it('returns every colour, rather than failing, when asked for more than exist', () => {
    const offered = offerColours(COLOURS, COLOURS.length + 3, seeded(2));
    expect(offered.length).toBe(COLOURS.length);
  });

  it('can offer every colour in the first place', () => {
    // A shuffle with an off-by-one never moves the last element to the front.
    // Over enough draws each colour should lead at least once.
    const random = seeded(3);
    const leaders = new Set<string>();
    for (let draw = 0; draw < 400; draw++) {
      leaders.add(offerColours(COLOURS, 5, random)[0].id);
    }
    expect(leaders.size).toBe(COLOURS.length);
  });

  it('does not reorder the collection it was given', () => {
    const before = COLOURS.map((colour) => colour.id);
    offerColours(COLOURS, 5, seeded(4));
    expect(COLOURS.map((colour) => colour.id)).toEqual(before);
  });

  it('survives a source that returns exactly 1', () => {
    expect(offerColours(COLOURS, 5, () => 1).length).toBe(5);
  });
});

describe('recommend', () => {
  it('only ever returns a painting from the chosen colour', () => {
    const random = seeded(5);
    for (const colour of COLOURS) {
      for (let draw = 0; draw < 50; draw++) {
        expect(colour.paintings).toContain(recommend(colour, random));
      }
    }
  });

  it('reaches every painting in the group', () => {
    const random = seeded(6);
    const seen = new Set<string>();
    for (let draw = 0; draw < 200; draw++) {
      seen.add(recommend(blue, random).slug);
    }
    expect(seen.size).toBe(blue.paintings.length);
  });

  it('never repeats the painting already on the wall', () => {
    const random = seeded(7);
    let current = recommend(blue, random).slug;
    for (let draw = 0; draw < 100; draw++) {
      const next = recommend(blue, random, current).slug;
      expect(next).not.toBe(current);
      current = next;
    }
  });

  it('returns the only painting in a group of one, even if it is already showing', () => {
    const single: IColour = { ...blue, paintings: [blue.paintings[0]] };
    expect(recommend(single, sequence(0.5), blue.paintings[0].slug)).toBe(blue.paintings[0]);
  });

  it('throws on an empty group rather than returning undefined', () => {
    const empty: IColour = { ...blue, paintings: [] };
    expect(() => recommend(empty, sequence(0))).toThrow(/no paintings/);
  });

  it('maps the source onto the group in order', () => {
    expect(recommend(blue, sequence(0))).toBe(blue.paintings[0]);
    expect(recommend(blue, sequence(0.999))).toBe(blue.paintings[blue.paintings.length - 1]);
  });
});
