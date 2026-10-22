import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  InjectionToken,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  BLOOM_RADIUS,
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
} from './atmosphere/atmospheric-calibration';
import { createFog } from './atmosphere/fog';
import { createSkyDome } from './atmosphere/sky-dome';
import * as CALIBRATION from './batoid/batoid-calibration';
import { flightStep, launchInitialState } from './batoid/batoid-transformation';
import { Random } from './batoid/batoid-types';
import { advance, STOPPED_CLOCK } from './cauldron/cauldron-clock';
import { createCauldron, poseCauldron } from './cauldron/cauldron-creation';
import { KEY_LIGHT_POSITION } from './light/light-calibration';
import { createHemisphereLight, createKeyLight, createRimLight } from './light/light-initiation';

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

@Component({
  imports: [],
  selector: 'app-murmuration',
  styleUrl: './murmuration.css',
  templateUrl: './murmuration.html',
})
export class Murmuration implements AfterViewInit, OnDestroy {
  private readonly random = inject(MURMURATION_RANDOM);
  private readonly createRenderer = inject(MURMURATION_RENDERER);
  private readonly createComposer = inject(MURMURATION_COMPOSER);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');
  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private bats?: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private skyDome?: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  protected readonly webGLfailure = signal(false);

  public ngAfterViewInit(): void {
    const canvas = this.canvas().nativeElement;
    const scene = new THREE.Scene();

    this.initializeScene(scene);

    const skyDome = createSkyDome(new THREE.Vector3(...KEY_LIGHT_POSITION).normalize());
    this.skyDome = skyDome;
    scene.add(skyDome);

    const camera = this.createCamera(canvas.clientWidth / canvas.clientHeight);
    this.setAndOrientCamera(camera);

    const bats = createCauldron();
    const flight = launchInitialState(
      this.random,
      CALIBRATION.INITIAL_DIMENSIONS,
      CALIBRATION.CAULDRON.count
    );
    const pose = new THREE.Object3D();
    poseCauldron(flight, bats, pose);
    this.bats = bats;
    scene.add(bats);

    try {
      const renderer = this.createRenderer(canvas);
      this.renderer = renderer;
      const canvasResolution = new THREE.Vector2(canvas.clientWidth, canvas.clientHeight);
      const bloomPass = this.createBloomPass(canvasResolution);
      this.calibrateRenderer(renderer, canvas.clientWidth, canvas.clientHeight);
      const composer = this.createComposer(renderer);
      this.composer = composer;
      this.orchestrateComposerPasses(composer, bloomPass, scene, camera);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        composer.render();
      } else {
        let clock = STOPPED_CLOCK;
        renderer.setAnimationLoop((nowMs) => {
          const advanced = advance(clock, nowMs);
          clock = advanced.state;
          for (let i = 0; i < advanced.ticks; i++) {
            flightStep(flight, CALIBRATION.TICK_SECONDS, CALIBRATION.INITIAL_DIMENSIONS);
          }
          if (advanced.ticks > 0) {
            poseCauldron(flight, bats, pose);
          }
          composer.render();
        });
      }
    } catch {
      this.webGLfailure.set(true);
    }
  }

  public ngOnDestroy(): void {
    this.destroyBats();
    this.destroySkyDome();
    this.destroyComposer();
    this.destroyRenderer();
  }

  private createBloomPass(canvasResolution: THREE.Vector2): UnrealBloomPass {
    return new UnrealBloomPass(canvasResolution, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  }

  private createCamera(widthToHeightRatio: number): THREE.PerspectiveCamera {
    return new THREE.PerspectiveCamera(50, widthToHeightRatio, 0.1, 100);
  }

  private initializeScene(scene: THREE.Scene): void {
    scene.add(createHemisphereLight());
    scene.add(createKeyLight());
    scene.add(createRimLight());
    scene.fog = createFog();
  }

  private setAndOrientCamera(camera: THREE.PerspectiveCamera): void {
    camera.position.set(0, -0.3, 3);
    camera.lookAt(0, 0.5, 0);
  }

  private calibrateRenderer(renderer: THREE.WebGLRenderer, width: number, height: number): void {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }

  private orchestrateComposerPasses(
    composer: EffectComposer,
    bloomPass: UnrealBloomPass,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ): void {
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  private destroyBats(): void {
    this.bats?.geometry.dispose();
    this.bats?.material.dispose();
    this.bats?.dispose();
  }

  private destroySkyDome(): void {
    this.skyDome?.material.dispose();
    this.skyDome?.geometry.dispose();
    this.skyDome?.dispose();
  }

  private destroyComposer(): void {
    if (!this.composer) {
      return;
    }
    for (const pass of this.composer.passes) {
      pass.dispose();
    }
    this.composer.dispose();
  }

  private destroyRenderer(): void {
    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
  }
}
