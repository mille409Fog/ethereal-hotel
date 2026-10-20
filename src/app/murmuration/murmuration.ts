import { AfterViewInit, Component, ElementRef, OnDestroy, signal, viewChild } from '@angular/core';
import * as THREE from 'three';
import * as CALIBRATION from './batoid-calibration';
import { createBatoidGeometry } from './batoid-geometry';

@Component({
  imports: [],
  selector: 'app-murmuration',
  styleUrl: './murmuration.css',
  templateUrl: './murmuration.html',
})
export class Murmuration implements AfterViewInit, OnDestroy {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');
  private renderer?: THREE.WebGLRenderer;
  private batoid?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
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

    const directionalLight = new THREE.DirectionalLight(CALIBRATION.PALETTE.sun, 1.5);
    directionalLight.position.set(2, 3, 4);
    scene.add(directionalLight);

    const camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );

    camera.position.set(0, 2.5, 1.5);
    camera.lookAt(0, 0, 0);

    const batoid = new THREE.Mesh(
      createBatoidGeometry(),
      new THREE.MeshStandardMaterial({ color: CALIBRATION.PALETTE.batoid, flatShading: true })
    );
    this.batoid = batoid;
    batoid.rotation.y = CALIBRATION.INITIAL_HEADING;
    scene.add(batoid);

    // some very unfortunate people can not run web gl, we need to account for this failure
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      this.renderer = renderer; // we use a const to obviate the existence problem while inside the animation loop
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        renderer.render(scene, camera);
      } else {
        let lastMs: number | undefined;
        let accumulator = 0;
        renderer.setAnimationLoop((nowMs) => {
          const frame =
            lastMs === undefined ? 0 : Math.min((nowMs - lastMs) / 1000, CALIBRATION.CLAMP_SECONDS);
          lastMs = nowMs;
          accumulator += frame;
          while (accumulator >= CALIBRATION.TICK_SECONDS) {
            batoid.rotation.y += CALIBRATION.SPIN_RADIANS_PER_SECOND * CALIBRATION.TICK_SECONDS;
            accumulator -= CALIBRATION.TICK_SECONDS;
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
    this.batoid?.geometry.dispose();
    this.batoid?.material.dispose();
    this.renderer?.dispose();
  }
}
