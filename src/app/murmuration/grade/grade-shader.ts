/**
 * a lift, gamma and gain grade over the finished frame. lift moves black and leaves white alone, gain moves white and
 * leaves black alone, and gamma bends what lies between, so the shadows and the highlights can be tinted apart.
 *
 * it reads display values, after the output pass has tone-mapped and encoded them, because a grade is a decision
 * about the picture a viewer sees; so, like the grain, it includes neither `tonemapping_fragment` nor
 * `colorspace_fragment`.
 *
 * this lives inside a template literal, so a backtick in a comment ends the string.
 */
import { FULL_SCREEN_VERTEX } from '../light/god-rays/god-rays-shaders';

const GRADE_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 lift, gamma, gain;
  varying vec2 vUv;
  void main() {
    vec4 frame = texture2D(tDiffuse, vUv);
    vec3 colour = clamp(frame.rgb, 0.0, 1.0);
    colour = gain * (colour + lift * (1.0 - colour));
    gl_FragColor = vec4(pow(max(colour, 0.0), 1.0 / gamma), frame.a);
  }`;

export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    lift: { value: null },
    gamma: { value: null },
    gain: { value: null },
  },
  vertexShader: FULL_SCREEN_VERTEX,
  fragmentShader: GRADE_FRAGMENT,
};
