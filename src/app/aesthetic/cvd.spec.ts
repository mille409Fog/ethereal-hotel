import { IOklch, linearToOklab, oklchToLinear } from './colour';
import { DEFICIENCIES, MACHADO_2009, simulate, simulateLinear } from './cvd';

const distance = (x: readonly number[], y: readonly number[]): number =>
  Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);

const ok = (colour: IOklch): [number, number, number] => linearToOklab(oklchToLinear(colour));

/**
 * The simulation holds to what a deficiency is: neutrals are untouched, and
 * each loses the contrast along its own axis and not along the others. A
 * transposed matrix or a gamma-encoded input would fail one of these.
 */
describe('cvd', () => {
  it('round-trips OKLab through linear RGB', () => {
    const colour = { l: 0.6, c: 0.12, h: 140 };
    const [l, a, b] = ok(colour);
    expect(l).toBeCloseTo(0.6, 6);
    expect(Math.hypot(a, b)).toBeCloseTo(0.12, 6);
  });

  it('leaves white and greys as they are, since each matrix row sums to one', () => {
    for (const deficiency of DEFICIENCIES) {
      for (const row of MACHADO_2009[deficiency]) {
        expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 4);
      }
      const [r, g, b] = simulateLinear([0.4, 0.4, 0.4], deficiency);
      expect(r).toBeCloseTo(0.4, 3);
      expect(g).toBeCloseTo(0.4, 3);
      expect(b).toBeCloseTo(0.4, 3);
    }
  });

  it('maps pure red to the protanopia matrix’s first column, clamped', () => {
    const [r, g, b] = simulateLinear([1, 0, 0], 'protanopia');
    expect(r).toBeCloseTo(0.152286, 6);
    expect(g).toBeCloseTo(0.114503, 6);
    expect(b).toBe(0);
  });

  // A pair at one lightness, opposite each other through grey along the hue
  // direction `h`, and how much of their difference a deficiency keeps. Each
  // deficiency is the loss of one cone type, and shows as one direction it
  // nearly erases while the direction across it survives.
  const along = (h: number): [IOklch, IOklch] => [
    { l: 0.7, c: 0.08, h },
    { l: 0.7, c: 0.08, h: h + 180 },
  ];
  const kept = (pair: [IOklch, IOklch], deficiency: (typeof DEFICIENCIES)[number]): number =>
    distance(simulate(pair[0], deficiency), simulate(pair[1], deficiency)) /
    distance(ok(pair[0]), ok(pair[1]));

  // Magenta against teal. Protanopia keeps more of it than deuteranopia
  // because a protanope also sees reds darker, so some lightness survives.
  it('erases red-green for protanopia and deuteranopia, and keeps yellow-blue whole', () => {
    expect(kept(along(0), 'deuteranopia')).toBeLessThan(0.15);
    expect(kept(along(0), 'protanopia')).toBeLessThan(0.5);
    for (const deficiency of ['protanopia', 'deuteranopia'] as const) {
      expect(kept(along(90), deficiency)).toBeGreaterThan(0.95);
    }
  });

  // Violet against yellow-green, the tritan confusion; not blue against
  // yellow, which the common name "blue-yellow deficiency" suggests and
  // which the first version of this test wrongly assumed.
  it('erases violet against yellow-green for tritanopia, and keeps red-green', () => {
    expect(kept(along(120), 'tritanopia')).toBeLessThan(0.25);
    expect(kept(along(0), 'tritanopia')).toBeGreaterThan(0.95);
  });

  // The textbook deuteranope confusion, measured on this wheel's hues: a
  // blue and a violet of one lightness, 70° apart, become one colour.
  it('makes blue and violet indistinguishable for deuteranopia', () => {
    const pair: [IOklch, IOklch] = [
      { l: 0.75, c: 0.1, h: 230 },
      { l: 0.75, c: 0.1, h: 300 },
    ];
    expect(kept(pair, 'deuteranopia')).toBeLessThan(0.05);
  });
});
