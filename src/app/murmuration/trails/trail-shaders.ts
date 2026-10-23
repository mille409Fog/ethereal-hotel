/**
 * the trail keeps the last frame, faded toward this one, wherever the past was darker than the present. three's
 * afterimage keeps the brighter of the two instead, which suits sparks on black and is backwards here: the bats are
 * dark against a bright sky, so its trails would be invisible and the sun would smear. this way a silhouette leaves a
 * wake and the sun, being bright, leaves none.
 *
 * darker is judged by luma rather than per channel, because a per-channel minimum mixes two colours into a third
 * that neither frame contained.
 *
 * this lives inside a template literal, so a backtick in a comment ends the string.
 */

export const TRAIL_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse, tPast;
  uniform float persistence;
  varying vec2 vUv;
  float luma(vec3 colour) {
    return dot(colour, vec3(0.2126, 0.7152, 0.0722));
  }
  void main() {
    vec4 now = texture2D(tDiffuse, vUv);
    vec3 faded = mix(now.rgb, texture2D(tPast, vUv).rgb, persistence);
    gl_FragColor = vec4(luma(faded) < luma(now.rgb) ? faded : now.rgb, now.a);
  }`;

export const COPY_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
  }`;
