/** injection tokens used by the watershed component, each a seam a spec replaces */
import { InjectionToken } from '@angular/core';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { IQualityTier, QUALITY_TIERS } from './quality/quality-calibration';
import { Random } from './seed/seed';

/**
 * the quality tiers, best first. a spec supplies tiers with a grid of a few cells: raising a land is noise at
 * every cell, and at the calibrated million of them it would be most of a second for every test that starts a storm.
 */
export const WATERSHED_TIERS = new InjectionToken<readonly IQualityTier[]>('WATERSHED_TIERS', {
  factory: () => QUALITY_TIERS,
});

/**
 * the chance a fresh seed is drawn from. `Math.random` by default, read at each call and not captured, because
 * `e2e/project-frames.spec.ts` pins chance by replacing `Math.random` before the app loads.
 */
export const WATERSHED_RANDOM = new InjectionToken<Random>('WATERSHED_RANDOM', {
  factory: () => (): number => Math.random(),
});

/** the address's query string, which may name a seed */
export const WATERSHED_SEARCH = new InjectionToken<string>('WATERSHED_SEARCH', {
  factory: () => window.location.search,
});

/** jsdom has no WebGL, so a spec supplies a renderer that records what was asked of it */
export const WATERSHED_RENDERER = new InjectionToken<
  (canvas: HTMLCanvasElement) => THREE.WebGLRenderer
>('WATERSHED_RENDERER', {
  factory: () => (canvas) => new THREE.WebGLRenderer({ canvas, antialias: true }),
});

/**
 * the composer, abstracted for the same reason. it is built on a half-float target, so light brighter than white
 * survives until the bloom and the tone mapping have seen it, and one that carries a depth texture, which the
 * water and the fog will read. the composer clones the target for its second buffer and the clone carries its own.
 */
export const WATERSHED_COMPOSER = new InjectionToken<
  (renderer: THREE.WebGLRenderer) => EffectComposer
>('WATERSHED_COMPOSER', {
  factory: () => (renderer) => {
    const { width, height } = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(width, height),
    });
    const composer = new EffectComposer(renderer, target);
    // a supplied target is taken as already sized; this applies the pixel ratio, as the default target would
    composer.setSize(width, height);
    return composer;
  },
});
