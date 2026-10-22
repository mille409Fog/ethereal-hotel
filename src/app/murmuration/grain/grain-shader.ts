/**
 * film grain over the finished frame: monochrome, heaviest in the shadows and gone in the highlights, as on a
 * negative, so the sun's disc and the brightest sky stay clean while the bats and the dark corners crawl.
 *
 * it reads display values, after the output pass has tone-mapped and encoded them, so it deliberately includes
 * neither `tonemapping_fragment` nor `colorspace_fragment`: either would finish the picture a second time.
 * a side effect worth keeping is that it dithers the sky's gradient, which otherwise bands at eight bits.
 *
 * this lives inside a template literal, so a backtick in a comment ends the string.
 */
import { FULL_SCREEN_VERTEX } from '../light/god-rays/god-rays-shaders';

/** after Dave Hoskins, "Hash without Sine": no sin(), so it does not fall apart at large coordinates */
const GRAIN_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float intensity, seed;
  varying vec2 vUv;
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  void main() {
    vec4 frame = texture2D(tDiffuse, vUv);
    vec2 cell = gl_FragCoord.xy + seed * vec2(1301.0, 977.0);
    // two uniform draws summed are triangular, so most pixels move a little and few move the whole way
    float noise = hash(cell) + hash(cell + 17.0) - 1.0;
    float luma = clamp(dot(frame.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    float response = 1.0 - luma * luma;
    gl_FragColor = vec4(frame.rgb + noise * intensity * response, frame.a);
  }`;

export const GrainShader = {
  name: 'GrainShader',
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0 },
    seed: { value: 0 },
  },
  vertexShader: FULL_SCREEN_VERTEX,
  fragmentShader: GRAIN_FRAGMENT,
};
