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
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { createBloomPass } from './atmosphere/bloom';
import { createFog } from './atmosphere/fog';
import { createSkyDome } from './atmosphere/sky-dome';
import { bankFlight, createBanking } from './batoid/batoid-banking/batoid-banking';
import { createSteeringScratch, steerFlight } from './batoid/batoid-behavior/batoid-behavior';
import * as CALIBRATION from './batoid/batoid-calibration';
import {
  flightStep,
  launchInitialState,
} from './batoid/batoid-transformation/batoid-transformation';
import { orbitCamera, verticalFovFor } from './camera/camera-orbit/camera-orbit';
import { createCamera } from './camera/create-camera';
import { advance, STOPPED_CLOCK } from './cauldron/cauldron-clock/cauldron-clock';
import {
  beatWings,
  createCauldron,
  poseCauldron,
} from './cauldron/cauldron-creation/cauldron-creation';
import { GRADE } from './grade/grade-calibration';
import { GradePass } from './grade/grade-pass/grade-pass';
import { GRAIN_INTENSITY } from './grain/grain-calibration';
import { GrainPass } from './grain/grain-pass/grain-pass';
import { GodRaysPass } from './light/god-rays/god-rays-pass';
import {
  GOD_RAYS,
  KEY_LIGHT_POSITION,
  VIGNETTE_OFFSET,
  VIGNETTER_DARKNESS,
} from './light/light-calibration';
import { createHemisphereLight, createKeyLight, createRimLight } from './light/light-initiation';
import {
  MURMURATION_COMPOSER,
  MURMURATION_FLOCK_SIZE,
  MURMURATION_RANDOM,
  MURMURATION_RENDERER,
} from './murmuration.tokens';
import {
  PIXEL_RATIO_FLOOR,
  REDUCED_MOTION_QUERY,
  TONE_MAPPING_EXPOSURE,
} from './renderer/renderer-calibration';
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

    this.initializeScene(scene);

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
      this.calibrateRenderer(renderer, canvas.clientWidth, canvas.clientHeight);
      const composer = this.createComposer(renderer);
      this.composer = composer;
      this.orchestrateComposerPasses(composer, bloomPass, scene, camera, sunDirection);
      const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
      this.followCanvasSize(canvas, renderer, composer, camera, reducedMotion);
      if (reducedMotion) {
        composer.render();
      } else {
        let clock = STOPPED_CLOCK;
        let flownSeconds = 0;
        const scratch = createSteeringScratch(this.flockSize);
        const banking = createBanking(flight);
        renderer.setAnimationLoop((nowMs) => {
          const advanced = advance(clock, nowMs);
          clock = advanced.state;
          for (let i = 0; i < advanced.ticks; i++) {
            // turn first, lean into the turn, then fly the new heading, so each tick's position follows from that tick's steer
            steerFlight(
              flight,
              CALIBRATION.TICK_SECONDS,
              CALIBRATION.AWARENESS,
              CALIBRATION.BEHAVIOUR_WEIGHTS,
              CALIBRATION.INITIAL_DIMENSIONS,
              scratch
            );
            bankFlight(flight, banking, CALIBRATION.TICK_SECONDS);
            flightStep(flight, CALIBRATION.TICK_SECONDS);
          }
          if (advanced.ticks > 0) {
            poseCauldron(flight, bats, pose, banking.rolls);
          }
          flownSeconds += advanced.ticks * CALIBRATION.TICK_SECONDS;
          // the flock's clock, so a hidden tab does not swing the camera round or race the wings;
          // the carried remainder keeps both gliding between ticks
          const seconds = flownSeconds + clock.carriedSeconds;
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
    this.destroyBats();
    this.destroySkyDome();
    this.destroyComposer();
    this.destroyRenderer();
  }

  /** the canvas fills the viewport, so it changes size whenever the window does, a phone turns, or its address bar
   *  slides away; without this the first frame's buffers are stretched over the new shape. the composer hands the
   *  size on to every pass. a still frame under reduced motion has no loop to pick the change up, so it is redrawn */
  private followCanvasSize(
    canvas: HTMLCanvasElement,
    renderer: THREE.WebGLRenderer,
    composer: EffectComposer,
    camera: THREE.PerspectiveCamera,
    redraw: boolean
  ): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    this.resizeObserver = new ResizeObserver(() => {
      // an observer reports once on observe, and a hidden canvas measures zero; neither is a new shape
      if (
        canvas.clientWidth === 0 ||
        canvas.clientHeight === 0 ||
        (canvas.clientWidth === width && canvas.clientHeight === height)
      ) {
        return;
      }
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.fov = verticalFovFor(camera.aspect);
      camera.updateProjectionMatrix();
      if (redraw) {
        composer.render();
      }
    });
    this.resizeObserver.observe(canvas);
  }

  private initializeScene(scene: THREE.Scene): void {
    scene.add(createHemisphereLight());
    scene.add(createKeyLight());
    scene.add(createRimLight());
    scene.fog = createFog();
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
    composer.addPass(this.generateVignettePass());
    composer.addPass(new OutputPass());
    composer.addPass(new GradePass(GRADE));
    composer.addPass(new GrainPass(GRAIN_INTENSITY));
  }

  private generateVignettePass(): ShaderPass {
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['offset'].value = VIGNETTE_OFFSET;
    vignettePass.uniforms['darkness'].value = VIGNETTER_DARKNESS;
    return vignettePass;
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
