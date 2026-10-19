import { Component, OnInit } from '@angular/core';
import * as THREE from 'three';

@Component({
  imports: [],
  selector: 'app-murmuration',
  styleUrl: './murmuration.css',
  templateUrl: './murmuration.html',
})
export class Murmuration implements OnInit {
  public ngOnInit(): void {
    const scene = new THREE.Scene();
    const ambientLight = new THREE.AmbientLight(0x96ded1, 0.5);
    scene.add(ambientLight);
  }
}
