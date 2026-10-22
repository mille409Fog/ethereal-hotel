/** injection tokens used by the murmuration component */
import { InjectionToken } from '@angular/core';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Random } from './batoid/batoid-types';

export const MURMURATION_RANDOM = new InjectionToken<Random>('MURMURATION_RANDOM', {
  factory: () => Math.random,
});

/**
 * additonal renderer abstraction in order to facilitate the spec environment.
 */
export const MURMURATION_RENDERER = new InjectionToken<
  (canvas: HTMLCanvasElement) => THREE.WebGLRenderer
>('MURMURATION_RENDERER', {
  factory: () => (canvas) => new THREE.WebGLRenderer({ canvas, antialias: true }),
});

/**
 * the composer is abstracted for the same reason: drawing its passes needs a real web gl context.
 */
export const MURMURATION_COMPOSER = new InjectionToken<
  (renderer: THREE.WebGLRenderer) => EffectComposer
>('MURMURATION_COMPOSER', {
  factory: () => (renderer) => new EffectComposer(renderer),
});
