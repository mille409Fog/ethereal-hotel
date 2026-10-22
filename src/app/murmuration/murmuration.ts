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
import {
  CAMERA_FAR,
  CAMERA_LOOK_AT_POINT,
  CAMERA_NEAR,
  CAMERA_POSITION,
  CAMERA_VERTICAL_FOV,
} from './camera/camera-calibration';
import { advance, STOPPED_CLOCK } from './cauldron/cauldron-clock';
import { createCauldron, poseCauldron } from './cauldron/cauldron-creation';
import { GodRaysPass } from './light/god-rays/god-rays-pass';
import { GOD_RAYS, KEY_LIGHT_POSITION } from './light/light-calibration';
import { createHemisphereLight, createKeyLight, createRimLight } from './light/light-initiation';
import {
  MURMURATION_COMPOSER,
  MURMURATION_RANDOM,
  MURMURATION_RENDERER,
} from './murmuration.tokens';
import { PIXEL_RATIO_FLOOR, TONE_MAPPING_EXPOSURE } from './renderer/renderer-calibration';
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

    // one vector for the sky's glow and the light shafts, so the two cannot aim at different suns
    const sunDirection = new THREE.Vector3(...KEY_LIGHT_POSITION).normalize();
    const skyDome = createSkyDome(sunDirection);
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
      this.orchestrateComposerPasses(composer, bloomPass, scene, camera, sunDirection);
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
    return new THREE.PerspectiveCamera(
      CAMERA_VERTICAL_FOV,
      widthToHeightRatio,
      CAMERA_NEAR,
      CAMERA_FAR
    );
  }

  private initializeScene(scene: THREE.Scene): void {
    scene.add(createHemisphereLight());
    scene.add(createKeyLight());
    scene.add(createRimLight());
    scene.fog = createFog();
  }

  private setAndOrientCamera(camera: THREE.PerspectiveCamera): void {
    camera.position.set(...CAMERA_POSITION);
    camera.lookAt(...CAMERA_LOOK_AT_POINT);
  }

  private calibrateRenderer(renderer: THREE.WebGLRenderer, width: number, height: number): void {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_FLOOR));
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  }

  private orchestrateComposerPasses(
    composer: EffectComposer,
    bloomPass: UnrealBloomPass,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sunDirection: THREE.Vector3
  ): void {
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new GodRaysPass(camera, sunDirection, GOD_RAYS));
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
