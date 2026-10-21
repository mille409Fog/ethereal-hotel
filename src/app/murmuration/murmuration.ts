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
import * as CALIBRATION from './batoid/batoid-calibration';
import { flightStep, launchInitialState } from './batoid/batoid-transformation';
import { Random } from './batoid/batoid-types';
import { advance, STOPPED_CLOCK } from './cauldron/cauldron-clock';
import { createCauldron, poseCauldron } from './cauldron/cauldron-creation';
import { IThreeTuple } from './cauldron/cauldron-flight';

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

@Component({
  imports: [],
  selector: 'app-murmuration',
  styleUrl: './murmuration.css',
  templateUrl: './murmuration.html',
})
export class Murmuration implements AfterViewInit, OnDestroy {
  private readonly random = inject(MURMURATION_RANDOM);
  private readonly createRenderer = inject(MURMURATION_RENDERER);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');
  private renderer?: THREE.WebGLRenderer;
  private bats?: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  protected readonly webGLfailure = signal(false);

  public ngAfterViewInit(): void {
    const canvas = this.canvas().nativeElement;
    const scene = new THREE.Scene();

    scene.background = new THREE.Color(CALIBRATION.PALETTE.sky);

    const hemisphereLight = new THREE.HemisphereLight(
      CALIBRATION.PALETTE.sky,
      CALIBRATION.PALETTE.ground,
      0.5
    );
    scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(CALIBRATION.PALETTE.sun, 4);
    directionalLight.position.set(-3, 0.6, -4);
    scene.add(directionalLight);

    const rimLight = new THREE.DirectionalLight(CALIBRATION.PALETTE.sun, 1);
    rimLight.position.set(3, 1, -3);
    scene.add(rimLight);

    scene.fog = new THREE.Fog(CALIBRATION.PALETTE.fog, 1, 2);

    const camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );

    camera.position.set(0, -0.3, 3);
    camera.lookAt(0, 0.5, 0);

    const bats = createCauldron();
    const initialDimensions: IThreeTuple = {
      x: CALIBRATION.CAULDRON.halfWidth,
      y: CALIBRATION.CAULDRON.halfHeight,
      z: CALIBRATION.CAULDRON.halfDepth,
    };
    const flight = launchInitialState(this.random, initialDimensions, CALIBRATION.CAULDRON.count);
    const pose = new THREE.Object3D();
    poseCauldron(flight, bats, pose);
    this.bats = bats;
    scene.add(bats);

    // some very unfortunate people can not run web gl, we need to account for this failure
    try {
      const renderer = this.createRenderer(canvas);
      this.renderer = renderer; // we use a const to obviate the existence problem while inside the animation loop
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        renderer.render(scene, camera);
      } else {
        let clock = STOPPED_CLOCK;
        renderer.setAnimationLoop((nowMs) => {
          const advanced = advance(clock, nowMs);
          clock = advanced.state;
          for (let i = 0; i < advanced.ticks; i++) {
            flightStep(flight, CALIBRATION.TICK_SECONDS, initialDimensions);
          }
          if (advanced.ticks > 0) {
            poseCauldron(flight, bats, pose);
          }
          renderer.render(scene, camera);
        });
      }
    } catch {
      this.webGLfailure.set(true);
    }
  }

  public ngOnDestroy(): void {
    this.renderer?.setAnimationLoop(null); // implicitly handled by dispose however we wish for semiotic clarity
    this.bats?.geometry.dispose();
    this.bats?.material.dispose();
    this.bats?.dispose(); //unlike in the single case, the instanced mesh itself must be disposed as well as its constituent parts
    this.renderer?.dispose();
  }
}
