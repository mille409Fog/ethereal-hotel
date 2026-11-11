/**
 * seeded gradient noise, and the two sums of it the land is raised from. written here rather than installed: it
 * is forty lines, the piece takes no dependency, and the permutation has to come from the land's own seed.
 *
 * this is only ever run on the CPU. the land it raises is uploaded to the GPU as a texture, so there is no
 * second copy of it in GLSL to drift from this one.
 *
 * a leaf module: see `fields.ts`.
 */

export interface INoise {
  /** smooth noise in about [-1, 1], zero at every whole coordinate */
  at(x: number, y: number): number;
  /** octaves of `at` summed at halving strength, normalised back to about [-1, 1] */
  fbm(x: number, y: number, octaves: number): number;
  /** ridged multifractal in [0, 1]: sharp crests where the noise crosses zero, each octave weighted by the last */
  ridged(x: number, y: number, octaves: number): number;
}

const TABLE = 256;
const LACUNARITY = 2.03;
const GAIN = 0.5;

/** eight unit directions; the diagonal ones are scaled so every gradient has the same length */
const DIAGONAL = Math.SQRT1_2;
const GRADIENT_X = [1, -1, 0, 0, DIAGONAL, -DIAGONAL, DIAGONAL, -DIAGONAL];
const GRADIENT_Y = [0, 0, 1, -1, DIAGONAL, DIAGONAL, -DIAGONAL, -DIAGONAL];

/** Perlin's quintic: zero first and second derivative at both ends, so cells meet without a crease */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** noise whose every value follows from the draws `random` makes here, which is 255 of them */
export function createNoise(random: () => number): INoise {
  const permutation = new Uint8Array(TABLE * 2);
  for (let index = 0; index < TABLE; index++) {
    permutation[index] = index;
  }
  for (let index = TABLE - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const held = permutation[index];
    permutation[index] = permutation[other];
    permutation[other] = held;
  }
  for (let index = 0; index < TABLE; index++) {
    permutation[TABLE + index] = permutation[index];
  }

  const corner = (cellX: number, cellY: number, offsetX: number, offsetY: number): number => {
    const gradient = permutation[permutation[cellX & 255] + (cellY & 255)] & 7;
    return GRADIENT_X[gradient] * offsetX + GRADIENT_Y[gradient] * offsetY;
  };

  const at = (x: number, y: number): number => {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const inX = x - cellX;
    const inY = y - cellY;
    const blendX = fade(inX);
    const blendY = fade(inY);
    const top =
      corner(cellX, cellY, inX, inY) * (1 - blendX) +
      corner(cellX + 1, cellY, inX - 1, inY) * blendX;
    const bottom =
      corner(cellX, cellY + 1, inX, inY - 1) * (1 - blendX) +
      corner(cellX + 1, cellY + 1, inX - 1, inY - 1) * blendX;
    // a gradient noise in two dimensions peaks at the square root of a half; this brings it to about one
    return (top * (1 - blendY) + bottom * blendY) * Math.SQRT2;
  };

  const fbm = (x: number, y: number, octaves: number): number => {
    let sum = 0;
    let strength = 1;
    let total = 0;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave++) {
      // each octave is read from its own patch, or every one would be zero at the origin together
      sum += strength * at(x * frequency + octave * 17.31, y * frequency - octave * 9.73);
      total += strength;
      strength *= GAIN;
      frequency *= LACUNARITY;
    }
    return sum / total;
  };

  const ridged = (x: number, y: number, octaves: number): number => {
    let sum = 0;
    let strength = 1;
    let total = 0;
    let frequency = 1;
    let weight = 1;
    for (let octave = 0; octave < octaves; octave++) {
      const crest = 1 - Math.abs(at(x * frequency + octave * 17.31, y * frequency - octave * 9.73));
      const sharp = crest * crest * weight;
      sum += strength * sharp;
      total += strength;
      // detail gathers on the crests and leaves the valley floors smooth, which is what makes it read as ridges
      weight = Math.min(1, Math.max(0, sharp * 2));
      strength *= GAIN;
      frequency *= LACUNARITY;
    }
    return sum / total;
  };

  return { at, fbm, ridged };
}
