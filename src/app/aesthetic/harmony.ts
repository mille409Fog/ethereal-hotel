import { IOklch, oklchToLinear } from './colour';

/**
 * Colour harmony, as Ou and Luo measured it.
 *
 * The model is Ou & Luo, "A colour harmony model for two-colour combinations",
 * Color Research and Application 31(3), 2006 (doi:10.1002/col.20208). By the
 * authors' 2008 account (below) it was fitted to seventeen observers'
 * judgements of 1431 pairs, every pair of 54 colours, shown as flat patches on
 * a mid-grey ground, and it encodes four patterns the data showed: two colours differing only in lightness tend to harmonise; lighter
 * pairs harmonise more; a small lightness difference costs harmony; and among
 * hues blue harmonises most and red least, with bright yellows doing far
 * better than dark ones.
 *
 * The coefficients below were checked against the equations as printed by
 * the same group in "A colour design tool based on empirical studies"
 * (Design Research Society conference, Sheffield, 2008), the copy that is
 * openly readable. The paper's own caveat travels with them: every observer
 * was a Chinese student studying in the UK, and the model may not hold for
 * other people, shapes or textures. The page says so too.
 *
 * Three colours are scored by Ou, Chong, Luo & Minchew, "Additivity of colour
 * harmony", Color Research and Application 36(5), 2011 (doi:10.1002/col.20624):
 * the harmony of a three-colour combination is the average of its three pairs',
 * which predicted 6545 three-colour wheels at r = 0.71 and 111 interior images
 * at r = 0.93.
 *
 * The model is defined in CIELAB. sRGB's white point is D65 and Ou and Luo
 * measured under a D65 simulator, so the conversion needs no adaptation.
 */

/** A colour in CIELAB (D65), with its polar form precomputed. */
export interface ILab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
  /** C*ab. */
  readonly c: number;
  /** h_ab in degrees, [0, 360). */
  readonly h: number;
}

const D65 = { x: 0.95047, y: 1, z: 1.08883 } as const;

/** CIE's cube root with its linear toe, for the Lab transfer function. */
function f(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

const DEGREES = 180 / Math.PI;
const RADIANS = Math.PI / 180;

export function toLab(colour: IOklch): ILab {
  const [r, g, b] = oklchToLinear(colour).map((v) => Math.min(1, Math.max(0, v)));
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const fx = f(x / D65.x);
  const fy = f(y / D65.y);
  const fz = f(z / D65.z);
  const lab = { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  return {
    ...lab,
    c: Math.hypot(lab.a, lab.b),
    h: (((Math.atan2(lab.b, lab.a) * DEGREES) % 360) + 360) % 360,
  };
}

/**
 * The hue effect of one colour, H_SY. Each colour of a pair contributes its
 * own: how harmonious its hue tends to be (H_S, highest near blue, lowest near
 * red), plus the yellow effect (E_Y, a bonus for light yellows that turns into
 * a penalty for dark ones), both scaled by chroma (E_C), since a near-grey has
 * no hue to speak of.
 */
export function hueEffect(lab: ILab): number {
  const hs =
    -0.08 - 0.14 * Math.sin((lab.h + 50) * RADIANS) - 0.07 * Math.sin((2 * lab.h + 90) * RADIANS);
  return chromaEffect(lab) * hs + yellowEffect(lab);
}

/** E_C: how much of a colour's hue effect counts, from 0 at grey to 1. */
function chromaEffect({ c }: ILab): number {
  return 0.5 + 0.5 * Math.tanh(-2 + 0.5 * c);
}

/**
 * The yellow effect's share of H_SY, already scaled by E_C: positive for light
 * yellows, negative below L* 58 (dark yellows, the khaki the paper names),
 * and near zero away from hue 90°.
 */
export function yellowEffect(lab: ILab): number {
  const k = (90 - lab.h) / 10;
  return chromaEffect(lab) * ((0.22 * lab.l - 12.8) / 10) * Math.exp(k - Math.exp(k));
}

/**
 * Ou and Luo's CH for two colours, higher being more harmonious. The sum of a chromatic term (falls as the colours differ in
 * hue and chroma), a lightness term (rises with their summed lightness and
 * with their lightness difference, saturating near ΔL* = 20) and each colour's
 * hue effect.
 */
export function pairHarmony(one: ILab, two: ILab): number {
  // ΔH*ab from the chord between the two hues, as CIELAB defines it.
  const dh = (two.h - one.h) * RADIANS;
  const dH = 2 * Math.sqrt(one.c * two.c) * Math.sin(dh / 2);
  const dC = Math.hypot(dH, (two.c - one.c) / 1.46);
  const hc = 0.04 + 0.53 * Math.tanh(0.8 - 0.045 * dC);

  const lsum = one.l + two.l;
  const dl = Math.abs(one.l - two.l);
  const hl =
    0.28 + 0.54 * Math.tanh(-3.88 + 0.029 * lsum) + (0.14 + 0.15 * Math.tanh(-2 + 0.2 * dl));

  return hc + hl + hueEffect(one) + hueEffect(two);
}

/** Ou et al. (2011): a three-colour combination's harmony is its pairs' mean. */
export function tripleHarmony(a: ILab, b: ILab, c: ILab): number {
  return (pairHarmony(a, b) + pairHarmony(a, c) + pairHarmony(b, c)) / 3;
}
