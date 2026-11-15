/**
 * one shader for both of the storm's reads of `land`: each texel it writes is the sum of a square block of the
 * texture it reads, times a weight. a weight of one over the block's area is the block's mean, and that is the
 * quarter copy the valley is found on (`valley.ts`); a weight of one, run again on its own output until one texel
 * is left, is the sum of the whole land, and that is the readout's totals.
 *
 * it reads with `texelFetch` and never a filter, as the simulation does, and skips a texel off the edge of what
 * it reads, so a side that does not divide by the block is summed whole.
 *
 * the blocks are summed a row at a time and the rows added after, so a land summed twice is summed in the same
 * order. the sum is 32-bit float; over a million cells of cut it is good to about one part in ten million, which
 * is far finer than a readout that shows four figures.
 *
 * this lives inside a template literal, so a backtick in a comment ends the string. GLSL ES 3.00 reserves a long
 * list of ordinary words; see `sim/sim-shaders.ts`. `verify:watershed` compiles it and holds its sum to the
 * reference model's.
 *
 * a leaf module: see `model/fields.ts`.
 */

/** the uniforms: the texture summed, the side of the block in texels, and the weight */
export const BLOCK_SOURCE = 'summed';
export const BLOCK_SIDE = 'blockSide';
export const BLOCK_WEIGHT = 'weight';

/** the most texels on a side the shader will sum: the loops need a constant bound */
export const BLOCK_MOST = 16;

/** the quarter copy is a quarter of the land's side */
export const QUARTER = 4;

export const BLOCK_SUM_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D ${BLOCK_SOURCE};
uniform int ${BLOCK_SIDE};
uniform float ${BLOCK_WEIGHT};

out vec4 result;

void main() {
  ivec2 extent = textureSize(${BLOCK_SOURCE}, 0);
  ivec2 origin = ivec2(gl_FragCoord.xy) * ${BLOCK_SIDE};
  vec4 total = vec4(0.0);
  for (int j = 0; j < ${BLOCK_MOST}; j++) {
    if (j >= ${BLOCK_SIDE}) {
      break;
    }
    vec4 row = vec4(0.0);
    for (int i = 0; i < ${BLOCK_MOST}; i++) {
      if (i >= ${BLOCK_SIDE}) {
        break;
      }
      ivec2 p = origin + ivec2(i, j);
      if (p.x < extent.x && p.y < extent.y) {
        row += texelFetch(${BLOCK_SOURCE}, p, 0);
      }
    }
    total += row;
  }
  result = total * ${BLOCK_WEIGHT};
}`;

/**
 * the sides of the targets a sum of a `size` grid passes through, `side` at a time, down to one texel. never
 * empty: the last is always 1, which is the texel read back
 */
export function reductionSizes(size: number, side: number): number[] {
  const sizes: number[] = [];
  let at = size;
  do {
    at = Math.ceil(at / side);
    sizes.push(at);
  } while (at > 1);
  return sizes;
}
