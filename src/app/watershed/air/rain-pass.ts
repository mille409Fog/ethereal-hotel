/**
 * the rain, as a pass over the finished scene: `RAIN_STREAKS` from `air-shaders.ts` over every pixel, in linear
 * light, before the bloom and the tone mapping see it.
 *
 * its density is the rain's strength and nothing else, so a pass told there is no rain draws nothing, and is
 * switched off rather than run: the composer skips a disabled pass, and a full-screen draw of no streaks costs
 * what a full-screen draw of many does. the streaks fall on the clock the wind blows on, which the storm hands
 * on with the rain.
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FULL_SCREEN_VERTEX } from '../../murmuration/light/god-rays/god-rays-shaders';
import { RAIN } from '../land/land-shaders';
import { AIR_LOOK, IAirLook } from './air-calibration';
import { AIR_CLOCK, RAIN_COLOURS, RAIN_COUNTS, RAIN_FLOATS, RAIN_STREAKS } from './air-shaders';

const RAIN_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float ${RAIN};
uniform float ${AIR_CLOCK};
varying vec2 vUv;
${RAIN_STREAKS}
void main() {
  vec4 frame = texture2D(tDiffuse, vUv);
  float covered = streaksAt(gl_FragCoord.xy, ${RAIN}, ${AIR_CLOCK}) * rainOpacity;
  gl_FragColor = vec4(mix(frame.rgb, rainColour, covered), frame.a);
}`;

export class RainPass extends ShaderPass {
  constructor(look: IAirLook = AIR_LOOK) {
    const uniforms: Record<string, THREE.IUniform> = {
      tDiffuse: { value: null },
      [RAIN]: { value: 0 },
      [AIR_CLOCK]: { value: 0 },
    };
    for (const key of [...RAIN_FLOATS, ...RAIN_COUNTS]) {
      uniforms[key] = { value: look[key] };
    }
    for (const key of RAIN_COLOURS) {
      uniforms[key] = { value: new THREE.Vector3(...look[key]) };
    }
    super({
      name: 'RainShader',
      uniforms,
      vertexShader: FULL_SCREEN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
    });
    // there is no rain until a storm says there is
    this.enabled = false;
  }

  /** how hard it is raining, in [0, 1], and the time on the air's clock, seconds */
  public follow(rain: number, seconds: number): void {
    this.uniforms[RAIN].value = rain;
    this.uniforms[AIR_CLOCK].value = seconds;
    this.enabled = rain > 0;
  }
}
