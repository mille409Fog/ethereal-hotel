/**
 * the sky dome's shaders: a gradient from the horizon up to the zenith, with a glow of the horizon's colour
 * gathered around the sun.
 *
 * these live inside template literals, so a backtick in a comment ends the string.
 */

/** passes each vertex's direction from the dome's centre through, so the fragment knows where it looks */
export const SKY_DOME_VERTEX: string = /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`;

/** below the horizon is the horizon's colour; the sun's glow is the horizon's colour again, added on top */
export const SKY_DOME_FRAGMENT: string = /* glsl */ `
      uniform vec3 horizon, zenith, sunDirection;
      varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 colour = mix(horizon, zenith, pow(h,0.6));
        float glow = pow(max(dot(d,sunDirection),0.0),8.0);
        gl_FragColor = vec4(colour + glow * horizon * 0.6, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
