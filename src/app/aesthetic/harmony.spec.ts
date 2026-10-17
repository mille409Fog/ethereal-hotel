import { hueEffect, ILab, pairHarmony, toLab, tripleHarmony, yellowEffect } from './harmony';

/** A CIELAB colour from its polar form, for stating the paper's cases. */
function lch(l: number, c: number, h: number): ILab {
  const r = h * (Math.PI / 180);
  return { l, a: c * Math.cos(r), b: c * Math.sin(r), c, h };
}

/**
 * The model holds to what its authors reported it says. These are the four
 * patterns in the 2008 account, each stated as a comparison the coefficients
 * must reproduce, so a mistyped sign or constant fails here rather than
 * quietly reshaping every aesthetic.
 */
describe('harmony', () => {
  it('converts sRGB red to its textbook CIELAB (D65)', () => {
    // #ff0000 is L* 53.24, a* 80.09, b* 67.20.
    const red = toLab({ l: 0.62796, c: 0.25768, h: 29.234 });
    expect(red.l).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 0);
    expect(red.b).toBeCloseTo(67.2, 0);
  });

  it('(a) rates two colours differing only in lightness above two of different hue', () => {
    const base = lch(50, 40, 200);
    expect(pairHarmony(base, lch(80, 40, 200))).toBeGreaterThan(pairHarmony(base, lch(80, 40, 20)));
  });

  it('(b) rates a lighter pair above a darker one', () => {
    expect(pairHarmony(lch(80, 20, 250), lch(60, 20, 250))).toBeGreaterThan(
      pairHarmony(lch(40, 20, 250), lch(20, 20, 250))
    );
  });

  it('(c) rates a small lightness difference below a clear one', () => {
    const base = lch(50, 30, 150);
    expect(pairHarmony(base, lch(53, 30, 150))).toBeLessThan(pairHarmony(base, lch(75, 30, 150)));
  });

  it('(d) favours blue over red, and light yellows over dark ones', () => {
    expect(hueEffect(lch(50, 40, 260))).toBeGreaterThan(hueEffect(lch(50, 40, 30)));
    expect(yellowEffect(lch(90, 60, 90))).toBeGreaterThan(0);
    expect(yellowEffect(lch(35, 40, 90))).toBeLessThan(0);
  });

  it('takes a three-colour harmony as the mean of its pairs', () => {
    const [a, b, c] = [lch(30, 20, 10), lch(60, 30, 100), lch(90, 10, 250)];
    const mean = (pairHarmony(a, b) + pairHarmony(a, c) + pairHarmony(b, c)) / 3;
    expect(tripleHarmony(a, b, c)).toBeCloseTo(mean, 12);
  });

  it('is symmetric in its two colours', () => {
    const [a, b] = [lch(45, 50, 320), lch(70, 25, 60)];
    expect(pairHarmony(a, b)).toBeCloseTo(pairHarmony(b, a), 12);
  });
});
