/** injection tokens used by the watershed component, each a seam a spec replaces */
import { Location } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { IQualityTier, QUALITY_TIERS } from './quality/quality-calibration';
import { Random } from './seed/seed';
import { RaiseLand, raiseHere, raiseInWorker, spawnRaiseWorker } from './sim/raise-land';
import { fetchStoredLand, IStoredLand } from './stored/stored-land';

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

/**
 * writes a seed into the address, replacing the entry rather than adding one, so the address bar always names the
 * land on screen and the back button still leaves the route. a spec records the seed instead
 */
export const WATERSHED_ADDRESS = new InjectionToken<(seed: number) => void>('WATERSHED_ADDRESS', {
  factory: () => {
    const location = inject(Location);
    return (seed: number): void => {
      const [path] = location.path().split('?');
      location.replaceState(path, `seed=${seed}`);
    };
  },
});

/**
 * fetches and decodes `public/watershed-land.png`. jsdom can decode no image, so a spec supplies a land of a few
 * cells instead; it is the land a device that cannot simulate, or a visitor who asked for stillness, is shown
 */
export const WATERSHED_STORED_LAND = new InjectionToken<() => Promise<IStoredLand>>(
  'WATERSHED_STORED_LAND',
  { factory: () => (): Promise<IStoredLand> => fetchStoredLand() }
);

/**
 * raises a storm's land: in a worker where there is one (`sim/raise-land.ts`), and here where there is not, which
 * is jsdom. a spec supplies one that is there at once, so the storm starts in the frame that asks for it
 */
export const WATERSHED_RAISE = new InjectionToken<RaiseLand>('WATERSHED_RAISE', {
  factory: () => (typeof Worker === 'undefined' ? raiseHere : raiseInWorker(spawnRaiseWorker)),
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
 *
 * it is built with no samples. its antialiasing is the quality tier's (`quality/quality-calibration.ts`), and the
 * component gives it the tier's samples before the first frame and again when the meter steps down
 * (`composer/composer-samples.ts`).
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
