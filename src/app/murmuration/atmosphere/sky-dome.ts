/** creates the initial sky dome */
import * as THREE from 'three';
import * as CALIBRATION from '../batoid/batoid-calibration';

export function createSkyDome(
  sunDirection: THREE.Vector3
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  return new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        horizon: { value: new THREE.Color(CALIBRATION.PALETTE.sky) },
        zenith: { value: new THREE.Color(CALIBRATION.PALETTE.zenith) },
        sunDirection: { value: sunDirection },
      },
      vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
      fragmentShader: /* glsl */ `
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
      }`,
    })
  );
}
