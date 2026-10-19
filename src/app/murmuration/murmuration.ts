import { AfterViewInit, Component, ElementRef, OnDestroy, viewChild } from '@angular/core';
import * as THREE from 'three';

// a bat-droid (batoid) set in statis, later logic will be used to handle the movement

function createBatoidGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  // each ordered triplet gives a point in space, the n-tuple is ordered implicity by the 3 in the set attribute call
  const vertices = new Float32Array([0, 0, 0.6, -0.35, 0, -0.4, 0.35, 0, -0.4, 0, 0.15, -0.3]);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([0, 3, 1, 0, 2, 3, 0, 1, 2, 1, 3, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

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

  public ngAfterViewInit(): void {
    const canvas = this.canvas().nativeElement;
    const scene = new THREE.Scene();

    const hemisphereLight = new THREE.HemisphereLight(0x96ded1, 0x2e2a1f, 0.5);
    scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(0xf3d9c4, 1.5);
    directionalLight.position.set(2, 3, 4);
    scene.add(directionalLight);

    const camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );

    camera.position.set(0, 0.6, 3);
    camera.lookAt(0, 0, 0);

    this.batoid = new THREE.Mesh(
      createBatoidGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x2b2b30, flatShading: true })
    );
    this.batoid.rotation.y = Math.PI / 5;
    scene.add(this.batoid);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.render(scene, camera);
  }

  public ngOnDestroy(): void {
    this.batoid?.geometry.dispose();
    this.batoid?.material.dispose();
    this.renderer?.dispose();
  }
}
