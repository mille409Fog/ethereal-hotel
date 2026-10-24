import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { createBloomPass } from './atmosphere/bloom';
import { createSkyDome, disposeSkyDome } from './atmosphere/sky-dome';
import { createBanking } from './batoid/batoid-banking/batoid-banking';
import { createSteeringScratch } from './batoid/batoid-behavior/batoid-behavior';
import * as CALIBRATION from './batoid/batoid-calibration';
import { launchInitialState } from './batoid/batoid-transformation/batoid-transformation';
import { followCanvasSize } from './canvas/follow-canvas-size';
import { orbitCamera } from './camera/camera-orbit/camera-orbit';
import { createCamera } from './camera/create-camera';
import { advance, clockSeconds, STOPPED_CLOCK } from './cauldron/cauldron-clock/cauldron-clock';
import {
  beatWings,
  createCauldron,
  disposeCauldron,
  poseCauldron,
} from './cauldron/cauldron-creation/cauldron-creation';
import { flyTicks } from './cauldron/cauldron-ticks/cauldron-ticks';
import { disposeComposer, orchestrateComposerPasses } from './composer/orchestrate-composer-passes';
import { KEY_LIGHT_POSITION } from './light/light-calibration';
import {
  MURMURATION_COMPOSER,
  MURMURATION_FLOCK_SIZE,
  MURMURATION_RANDOM,
  MURMURATION_RENDERER,
} from './murmuration.tokens';
import { disposeRenderer } from './renderer/dispose-renderer';
import { calibrateRenderer, REDUCED_MOTION_QUERY } from './renderer/renderer-calibration';
import { initializeScene } from './scene/initialize-scene';
@Component({
  imports: [],
  selector: 'app-murmuration',
  styleUrl: './murmuration.css',
  templateUrl: './murmuration.html',
})
export class Murmuration implements AfterViewInit, OnDestroy {
  private readonly random = inject(MURMURATION_RANDOM);
  private readonly flockSize = inject(MURMURATION_FLOCK_SIZE);
  private readonly createRenderer = inject(MURMURATION_RENDERER);
  private readonly createComposer = inject(MURMURATION_COMPOSER);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');
  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private bats?: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private skyDome?: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private resizeObserver?: ResizeObserver;
  protected readonly webGLfailure = signal(false);

  public ngAfterViewInit(): void {
    const canvas = this.canvas().nativeElement;
    const scene = new THREE.Scene();

    initializeScene(scene);

    // one vector for the sky's glow and the light shafts, so the two cannot aim at different suns
    const sunDirection = new THREE.Vector3(...KEY_LIGHT_POSITION).normalize();
    const skyDome = createSkyDome(sunDirection);
    this.skyDome = skyDome;
    scene.add(skyDome);

    const camera = createCamera(canvas.clientWidth / canvas.clientHeight);
    orbitCamera(camera, 0);

    const bats = createCauldron(this.flockSize);
    const flight = launchInitialState(this.random, CALIBRATION.INITIAL_DIMENSIONS, this.flockSize);
    const pose = new THREE.Object3D();
    poseCauldron(flight, bats, pose);
    this.bats = bats;
    scene.add(bats);

    try {
      const renderer = this.createRenderer(canvas);
      this.renderer = renderer;
      const canvasResolution = new THREE.Vector2(canvas.clientWidth, canvas.clientHeight);
      const bloomPass = createBloomPass(canvasResolution);
      calibrateRenderer(renderer, canvas.clientWidth, canvas.clientHeight);
      const composer = this.createComposer(renderer);
      this.composer = composer;
      orchestrateComposerPasses(composer, bloomPass, scene, camera, sunDirection);
      const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
      this.resizeObserver = followCanvasSize(canvas, renderer, composer, camera, reducedMotion);
      if (reducedMotion) {
        composer.render();
      } else {
        let clock = STOPPED_CLOCK;
        const scratch = createSteeringScratch(this.flockSize);
        const banking = createBanking(flight);
        renderer.setAnimationLoop((nowMs) => {
          const advanced = advance(clock, nowMs);
          clock = advanced.state;
          flyTicks(flight, banking, scratch, advanced.ticks);
          if (advanced.ticks > 0) {
            poseCauldron(flight, bats, pose, banking.rolls);
          }
          const seconds = clockSeconds(clock);
          orbitCamera(camera, seconds);
          beatWings(bats, seconds);
          composer.render();
        });
      }
    } catch {
      this.webGLfailure.set(true);
    }
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.bats) {
      disposeCauldron(this.bats);
    }
    if (this.skyDome) {
      disposeSkyDome(this.skyDome);
    }
    if (this.composer) {
      disposeComposer(this.composer);
    }
    if (this.renderer) {
      disposeRenderer(this.renderer);
    }
  }
}
