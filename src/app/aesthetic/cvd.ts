import { IOklch, LinearRgb, linearToOklab, oklchToLinear } from './colour';

/**
 * Colour vision deficiency: how a colour looks to someone missing one of the
 * three cone types.
 *
 * The model is Machado, Oliveira & Fernandes, "A physiologically-based model
 * for simulation of color vision deficiency", IEEE TVCG 15(6), 2009. Each
 * deficiency is one 3×3 matrix applied to a colour's linear RGB. These are
 * the severity 1.0 matrices from the authors' published table, where 1.0 is
 * "the highest severity or a case of dichromacy": the whole cone type absent,
 * which is the worst case. Anomalous trichromats, the milder and more common
 * form, see somewhere between these and typical vision, so a colour pair that
 * survives dichromacy survives the milder forms too.
 *
 * The matrices act on linear light, not on gamma-encoded sRGB. The paper
 * leaves that implicit, and several libraries applied them to encoded values
 * until it was pointed out; the R colorspace package changed its default in
 * 2.1-0, noting that the difference is largest for saturated reds, purples and
 * oranges, which is exactly where this filter bites.
 *
 * Pure and Angular-free, like the rest of the colour code.
 */

export const DEFICIENCIES = ['protanopia', 'deuteranopia', 'tritanopia'] as const;
export type Deficiency = (typeof DEFICIENCIES)[number];

type Matrix = readonly [LinearRgb, LinearRgb, LinearRgb];

/**
 * Machado et al.'s severity 1.0 matrices, as their table prints them (it
 * labels them protanomaly, deuteranomaly and tritanomaly at severity 1.0,
 * which it defines as dichromacy). Protanopia and deuteranopia, missing the
 * long- and middle-wavelength cones, are the red-green deficiencies and by
 * far the most common; tritanopia, missing the short, is rare.
 */
export const MACHADO_2009: Readonly<Record<Deficiency, Matrix>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** Linear RGB as a person with `deficiency` would see it, clamped to the screen's range. */
export function simulateLinear(rgb: LinearRgb, deficiency: Deficiency): LinearRgb {
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  const [r, g, b] = rgb.map(clamp);
  const [x, y, z] = MACHADO_2009[deficiency].map(([m0, m1, m2]) => clamp(m0 * r + m1 * g + m2 * b));
  return [x, y, z];
}

/** A colour as a person with `deficiency` would see it, in OKLab `[L, a, b]`. */
export function simulate(colour: IOklch, deficiency: Deficiency): [number, number, number] {
  return linearToOklab(simulateLinear(oklchToLinear(colour), deficiency));
}
