/**
 * the stage: the scene, and the air in it.
 *
 * the air (`air/air.ts`) is the sky behind the block and the deck of cloud below its rim. it is the stage's
 * from the first frame, so the sky is there while the quality meter measures and before any land is.
 *
 * there is no slab and there are no lights. a land is stood on the stage by `stand-land.ts`, live from a storm or
 * stored, and it is lit by its own shader, so nothing in three.js's lighting is used by anything here. the slab
 * was what a visitor saw before there was a land and all a device that could not simulate ever saw; it went when
 * the stored land came, because from then on every visitor is shown a land the model made.
 */
import * as THREE from 'three';
import { createAir, IAir } from '../air/air';

export interface IStage {
  readonly scene: THREE.Scene;
  readonly air: IAir;
}

export function createStage(): IStage {
  const scene = new THREE.Scene();
  const air = createAir();
  scene.add(air.deck, air.dome);
  return { scene, air };
}

/** frees what the stage holds on the GPU; a land in the scene is its show's to free */
export function disposeStage(stage: IStage): void {
  stage.air.dispose();
}
