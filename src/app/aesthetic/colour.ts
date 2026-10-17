/**
 * OKLCH → sRGB, and the one question the wheel asks of it: how much chroma
 * fits.
 *
 * The wheel is built in OKLCH rather than HSL because HSL's lightness is a
 * formula, not a perception: `hsl(60 100% 50%)` and `hsl(240 100% 50%)` are
 * both "50% light" and one of them is nearly white to the eye. A ring of HSL
 * cells at one lightness is a ring that brightens at yellow and drops into a
 * hole at blue. OKLCH's `L` is built to track perceived lightness, so a ring
 * at one `L` reads as one tone all the way round, which is what makes a ring
 * a ring rather than a rainbow.
 *
 * The price is that OKLCH describes colours a screen cannot show. Every cell
 * is therefore gamut-mapped here, by the CSS Color 4 approach in its simplest
 * honest form: keep `L` and `h`, and reduce chroma until the colour is inside
 * sRGB. A clipped channel would also land in gamut, but it would move the hue,
 * and the hue is the one thing the wheel promises about a cell.
 *
 * Pure and Angular-free so the specs can hold the numbers without a DOM.
 * Matrices are Björn Ottosson's, from the OKLab paper.
 */

/** A colour in OKLCH: `l` in [0, 1], `c` ≥ 0, `h` in degrees. */
export interface IOklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** Linear-light sRGB. In gamut when every channel is in [0, 1]. */
export type LinearRgb = readonly [number, number, number];

/** How far outside [0, 1] a channel may sit and still count as in gamut. */
const GAMUT_EPSILON = 1e-6;

/** Above any chroma sRGB can display at any lightness or hue (about 0.32). */
const CHROMA_CEILING = 0.4;

/** Bisection steps for `maxChroma`: 2⁻²⁴ of the ceiling is far below a hex step. */
const CHROMA_STEPS = 24;

const RADIANS = Math.PI / 180;

/** OKLCH to linear-light sRGB, through OKLab and LMS. */
export function oklchToLinear({ l, c, h }: IOklch): LinearRgb {
  const a = c * Math.cos(h * RADIANS);
  const b = c * Math.sin(h * RADIANS);

  const lmsL = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const lmsM = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const lmsS = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * lmsL - 3.3077115913 * lmsM + 0.2309699292 * lmsS,
    -1.2684380046 * lmsL + 2.6097574011 * lmsM - 0.3413193965 * lmsS,
    -0.0041960863 * lmsL - 0.7034186147 * lmsM + 1.707614701 * lmsS,
  ];
}

/**
 * Linear-light sRGB back to OKLab, as `[L, a, b]`: the inverse of
 * `oklchToLinear`, before its polar step. The CVD simulation needs it, since
 * a simulated colour exists only as RGB.
 */
export function linearToOklab([r, g, b]: LinearRgb): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function inGamut(colour: IOklch): boolean {
  return oklchToLinear(colour).every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);
}

/**
 * The most chroma sRGB can show at this lightness and hue. Bisection rather
 * than a closed form: the gamut boundary in OKLCH is a curved surface with a
 * cusp per hue, and 24 halvings land well inside one hex step of it.
 */
export function maxChroma(l: number, h: number): number {
  let inside = 0;
  let outside = CHROMA_CEILING;
  for (let step = 0; step < CHROMA_STEPS; step++) {
    const mid = (inside + outside) / 2;
    if (inGamut({ l, c: mid, h })) {
      inside = mid;
    } else {
      outside = mid;
    }
  }
  return inside;
}

/** The sRGB transfer function, linear light to the encoded value a screen takes. */
function encode(linear: number): number {
  const v = Math.min(1, Math.max(0, linear));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** The colour as `#rrggbb`. Clamps the last epsilon, so call it on in-gamut colours. */
export function toHex(colour: IOklch): string {
  const channels = oklchToLinear(colour).map((v) =>
    Math.round(encode(v) * 255)
      .toString(16)
      .padStart(2, '0')
  );
  return `#${channels.join('')}`;
}
