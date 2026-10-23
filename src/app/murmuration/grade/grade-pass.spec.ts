import * as THREE from 'three';
import { PALETTE } from '../batoid/batoid-calibration';
import { GRADE } from './grade-calibration';
import { displayRgbOf, gainOf, GradePass, IGrade, liftOf } from './grade-pass';

/** the shader's arithmetic, in TypeScript, so a test can say what a colour becomes; jsdom cannot run GLSL */
const graded = (pass: GradePass, colour: THREE.Vector3): THREE.Vector3 => {
  const lift = pass.uniforms['lift'].value as THREE.Vector3;
  const gamma = pass.uniforms['gamma'].value as THREE.Vector3;
  const gain = pass.uniforms['gain'].value as THREE.Vector3;
  const lifted = colour
    .clone()
    .add(lift.clone().multiply(new THREE.Vector3(1, 1, 1).sub(colour)))
    .multiply(gain);
  return new THREE.Vector3(
    Math.max(lifted.x, 0) ** (1 / gamma.x),
    Math.max(lifted.y, 0) ** (1 / gamma.y),
    Math.max(lifted.z, 0) ** (1 / gamma.z)
  );
};

const NEUTRAL: IGrade = { ...GRADE, shadowStrength: 0, highlightStrength: 0, gamma: 1 };
const BLACK = new THREE.Vector3(0, 0, 0);
const WHITE = new THREE.Vector3(1, 1, 1);

describe('GradePass', () => {
  it('changes nothing at no strength and a gamma of one', () => {
    const pass = new GradePass(NEUTRAL);

    for (const value of [0, 0.2, 0.5, 0.9, 1]) {
      const grey = new THREE.Vector3(value, value, value);
      expect(graded(pass, grey).distanceTo(grey)).toBeCloseTo(0, 10);
    }
  });

  it('reads a hex as the display values it names, not as linear light', () => {
    // 0x80 is 128/255 on screen; THREE.Color would have linearised it to about 0.22
    expect(displayRgbOf(0x80ff00).toArray()).toEqual([128 / 255, 1, 0]);
  });

  it('lifts black toward the zenith indigo the sky is painted', () => {
    const zenith = displayRgbOf(PALETTE.zenith);
    // graded black is the lift through the gain, which warms it a little; it still leans indigo
    const lifted = graded(new GradePass(GRADE), BLACK);

    expect(liftOf(GRADE).normalize().distanceTo(zenith.normalize())).toBeCloseTo(0, 6);
    expect(lifted.length()).toBeGreaterThan(0);
    expect(lifted.z).toBeGreaterThan(lifted.x);
    expect(lifted.x).toBeGreaterThan(lifted.y);
  });

  it('warms white toward the sun, leaving its red channel full', () => {
    const warmed = graded(new GradePass(GRADE), WHITE);

    expect(warmed.x).toBeCloseTo(1, 6);
    expect(warmed.z).toBeLessThan(warmed.y);
    expect(warmed.y).toBeLessThan(1);
  });

  it('leaves the lift off white and the gain off black, so the two ends are tinted apart', () => {
    expect(liftOf(GRADE).length()).toBeGreaterThan(0);
    expect(
      graded(new GradePass({ ...GRADE, highlightStrength: 0 }), WHITE).distanceTo(WHITE)
    ).toBeCloseTo(0, 10);
    expect(gainOf({ ...GRADE, highlightStrength: 0 }).distanceTo(WHITE)).toBe(0);
  });

  it('opens the midtones above a gamma of one and deepens them below it', () => {
    const grey = new THREE.Vector3(0.5, 0.5, 0.5);

    expect(graded(new GradePass({ ...NEUTRAL, gamma: 1.2 }), grey).x).toBeGreaterThan(0.5);
    expect(graded(new GradePass({ ...NEUTRAL, gamma: 0.8 }), grey).x).toBeLessThan(0.5);
  });

  it('grades the finished picture, so it neither tone-maps nor encodes it a second time', () => {
    // jsdom cannot compile GLSL, so this reads the source: it runs after the output pass
    const { fragmentShader } = new GradePass(GRADE).material;

    expect(fragmentShader).not.toContain('tonemapping_fragment');
    expect(fragmentShader).not.toContain('colorspace_fragment');
  });
});
