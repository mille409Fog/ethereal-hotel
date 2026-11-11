import { drawSeed, HERO_SEED, mulberry32, parseSeed, SEED_SPAN } from './seed';

describe('seed', () => {
  describe('mulberry32', () => {
    it('draws the same sequence from the same seed', () => {
      const first = mulberry32(HERO_SEED);
      const second = mulberry32(HERO_SEED);

      expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    });

    it('draws a different sequence from a different seed', () => {
      expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    });

    it('stays inside [0, 1)', () => {
      const random = mulberry32(0xffffffff);

      for (let draw = 0; draw < 1000; draw++) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('reads a seed as an unsigned 32-bit integer, so one past the span is zero again', () => {
      expect(mulberry32(SEED_SPAN)()).toBe(mulberry32(0)());
    });
  });

  describe('parseSeed', () => {
    it('reads a seed out of a query string', () => {
      expect(parseSeed('?seed=4127')).toBe(4127);
      expect(parseSeed('?other=1&seed=0')).toBe(0);
    });

    it('accepts the largest seed and refuses one past it', () => {
      expect(parseSeed(`?seed=${SEED_SPAN - 1}`)).toBe(SEED_SPAN - 1);
      expect(parseSeed(`?seed=${SEED_SPAN}`)).toBeNull();
    });

    it('names no seed when the address has none', () => {
      expect(parseSeed('')).toBeNull();
      expect(parseSeed('?t=open')).toBeNull();
    });

    it('refuses anything that is not wholly digits, rather than reading the part that is', () => {
      expect(parseSeed('?seed=12abc')).toBeNull();
      expect(parseSeed('?seed=-3')).toBeNull();
      expect(parseSeed('?seed=1.5')).toBeNull();
      expect(parseSeed('?seed=')).toBeNull();
      expect(parseSeed('?seed=12345678901')).toBeNull();
    });
  });

  describe('drawSeed', () => {
    it('spreads one draw across every seed', () => {
      expect(drawSeed(() => 0)).toBe(0);
      expect(drawSeed(() => 0.5)).toBe(SEED_SPAN / 2);
      expect(drawSeed(() => 1 - Number.EPSILON)).toBe(SEED_SPAN - 1);
    });

    it('draws a seed an address can carry back', () => {
      const seed = drawSeed(mulberry32(7));

      expect(parseSeed(`?seed=${seed}`)).toBe(seed);
    });
  });
});
