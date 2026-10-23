/**
 * the colour grade as a shader pass. it turns the calibration's tints and strengths into the three vectors the
 * shader wants once, when it is built: the grade does not move, so nothing is recomputed per frame.
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GradeShader } from '../grade-shader';

export interface IGrade {
  readonly shadowTint: number;
  readonly shadowStrength: number;
  readonly highlightTint: number;
  readonly highlightStrength: number;
  readonly gamma: number;
}

/** a hex colour as the display values it names, 0..1 per channel. not THREE.Color, which would convert the hex into
 *  linear light: right for a material, wrong for a grade that runs after the picture is encoded for display */
export function displayRgbOf(hex: number): THREE.Vector3 {
  return new THREE.Vector3((hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff).divideScalar(0xff);
}

/** black lifted toward the tint by strength: the tint's own colour, scaled */
export function liftOf(grade: IGrade): THREE.Vector3 {
  return displayRgbOf(grade.shadowTint).multiplyScalar(grade.shadowStrength);
}

/** white pulled toward the tint by strength: one, mixed that far toward the tint's colour */
export function gainOf(grade: IGrade): THREE.Vector3 {
  return new THREE.Vector3(1, 1, 1).lerp(
    displayRgbOf(grade.highlightTint),
    grade.highlightStrength
  );
}

export class GradePass extends ShaderPass {
  constructor(grade: IGrade) {
    super(GradeShader);
    this.uniforms['lift'].value = liftOf(grade);
    this.uniforms['gamma'].value = new THREE.Vector3().setScalar(grade.gamma);
    this.uniforms['gain'].value = gainOf(grade);
  }
}
