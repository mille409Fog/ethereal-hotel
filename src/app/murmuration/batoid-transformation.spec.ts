import { spread } from './batoid-transformation';

describe('spread', () => {
  const RADIUS = 2;

  it('maps a draw of 0 to the near edge, -radius', () => {
    expect(spread(() => 0, RADIUS)).toBe(-RADIUS);
  });

  it('maps a draw of one half to the centre', () => {
    expect(spread(() => 0.5, RADIUS)).toBe(0);
  });

  it('approaches +radius from below as the draw approaches 1, and never reaches it', () => {
    const edge = spread(() => 1 - Number.EPSILON, RADIUS);

    expect(edge).toBeLessThan(RADIUS);
    expect(edge).toBeCloseTo(RADIUS, 10);
  });

  it('is symmetric about the centre', () => {
    expect(spread(() => 0.25, RADIUS)).toBe(-spread(() => 0.75, RADIUS));
  });

  it('draws exactly once per call', () => {
    const random = vi.fn(() => 0.5);

    spread(random, RADIUS);

    expect(random).toHaveBeenCalledTimes(1);
  });
});
