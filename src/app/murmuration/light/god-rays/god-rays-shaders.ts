/**
 * the three steps of the light shafts, after GPU Gems 3 ch. 13, "Volumetric Light Scattering as a Post-Process".
 *
 * mask: white where the sun can be seen, black where a bat covers it.
 * blur: every pixel walks toward the sun, adding up the mask as it goes, so a gap between bats becomes a shaft.
 * composite: the shafts are added to the frame, in the sun's colour.
 *
 * every uv here is 0..1 with y running up, the same as `sunOnScreen` writes.
 * these live inside template literals, so a backtick in a comment ends the string.
 */

/** the full-screen triangle `FullScreenQuad` draws, passing its uv through */
export const FULL_SCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/**
 * the sky dome writes no depth, so wherever the depth is still at the far plane, nothing is in front of the sky.
 * the bats fade out of the mask over the fog's distances, the way they fade out of the frame.
 */
export const MASK_FRAGMENT = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform vec2 sunUv;
  uniform float aspect, sunRadius, sunSoftness;
  uniform float cameraNear, cameraFar, occlusionNear, occlusionFar;
  varying vec2 vUv;
  void main() {
    vec2 offset = (vUv - sunUv) * vec2(aspect, 1.0);
    float disc = 1.0 - smoothstep(sunRadius - sunSoftness, sunRadius, length(offset));
    float viewDistance = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, cameraNear, cameraFar);
    float clear = clamp((viewDistance - occlusionNear) / (occlusionFar - occlusionNear), 0.0, 1.0);
    gl_FragColor = vec4(vec3(disc * clear), 1.0);
  }`;

/** SAMPLES is a define rather than a uniform: a WebGL 1 loop bound has to be a constant */
export const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tMask;
  uniform vec2 sunUv;
  uniform float density, decay, weight, exposure;
  varying vec2 vUv;
  void main() {
    vec2 stride = (vUv - sunUv) * density / float(SAMPLES);
    vec2 coord = vUv;
    float falloff = 1.0;
    float light = 0.0;
    for (int i = 0; i < SAMPLES; i++) {
      coord -= stride;
      light += texture2D(tMask, coord).r * falloff * weight;
      falloff *= decay;
    }
    gl_FragColor = vec4(vec3(light * exposure), 1.0);
  }`;

/** the frame is still linear and unbounded here; the output pass tone-maps both together */
export const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse, tRays;
  uniform vec3 colour;
  uniform float visibility;
  varying vec2 vUv;
  void main() {
    vec4 frame = texture2D(tDiffuse, vUv);
    vec3 rays = texture2D(tRays, vUv).r * colour * visibility;
    gl_FragColor = vec4(frame.rgb + rays, frame.a);
  }`;
