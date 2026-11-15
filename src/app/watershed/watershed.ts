/**
 * `/watershed`: a landscape eroded by a simulation while the visitor watches. `WATERSHED.md` is the plan.
 *
 * the component assembles a renderer, the post-processing chain, a camera, and the stage with its air and its
 * placeholder slab, finds out whether the device can run the simulation, chooses a quality tier from
 * measured frame time, and says on screen which of the three land states the visitor is in. it owns nothing clever:
 * each of those is a module with its own spec, and this file is the order they happen in.
 *
 * two things are decided once, at the start, and never revisited. reduced motion is read once, so a visitor who
 * asked for stillness gets one frame and no loop. and the land state is fixed before the first frame, because a
 * piece that changed its mind about whether it was simulating would have to say so mid-sentence.
 *
 * once a storm runs, the storm (`sim/storm.ts`) keeps its clocks and this file asks the camera's path
 * (`direction/camera-path.ts`) where to stand at them each frame. the visitor has three things to do, each real
 * DOM: **New land**, which draws a seed, writes it into the address and starts a storm on it; **Pause**, which
 * stops the storm's steps and its clock; and, once the orbit has begun, a drag or the arrow keys, which turn it.
 */
import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { HomeLink } from '../home-link/home-link';
import { disposeComposer } from '../murmuration/composer/orchestrate-composer-passes';
import { disposeRenderer } from '../murmuration/renderer/dispose-renderer';
import {
  calibrateRenderer,
  PIXEL_RATIO_FLOOR,
  REDUCED_MOTION_QUERY,
} from '../murmuration/renderer/renderer-calibration';
import { followCanvasSize } from './canvas/follow-canvas-size';
import { orchestratePasses } from './composer/orchestrate-passes';
import { cameraAt, IPose, ISteer, steer, steerable, UNSTEERED } from './direction/camera-path';
import { DIRECTION } from './direction/direction-calibration';
import { IReadout, readoutDigest, readoutRows } from './direction/readout';
import { landLine, LandState, landStateFor, showsStoredLand } from './land-state';
import { measure, UNMEASURED } from './quality/quality-meter';
import { drawSeed, HERO_SEED, parseSeed } from './seed/seed';
import { ANNOUNCE_EVERY_MS, REPORT_EVERY } from './sim/sim-calibration';
import { supportsFloatTargets } from './sim/sim-support';
import { IStorm, IStormFrame, startStorm } from './sim/storm';
import { createStage, disposeStage, IStage } from './stage/create-stage';
import { CAMERA_POSITION, CAMERA_TARGET } from './stage/stage-calibration';
import { aspectOf, createStageCamera } from './stage/stage-camera';
import {
  WATERSHED_ADDRESS,
  WATERSHED_COMPOSER,
  WATERSHED_RANDOM,
  WATERSHED_RENDERER,
  WATERSHED_SEARCH,
  WATERSHED_TIERS,
} from './watershed.tokens';

/** the stage's high view, which the storm is watched from and the camera's path starts at */
const VANTAGE: IPose = { eye: CAMERA_POSITION, target: CAMERA_TARGET };

/** what each arrow key turns the orbit by, in units of `keyTurn`: round the block, and up */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

@Component({
  imports: [HomeLink],
  selector: 'app-watershed',
  styleUrl: './watershed.css',
  templateUrl: './watershed.html',
  host: { '(document:keydown)': 'turn($event)' },
})
export class Watershed implements AfterViewInit, OnDestroy {
  private readonly random = inject(WATERSHED_RANDOM);
  private readonly search = inject(WATERSHED_SEARCH);
  private readonly address = inject(WATERSHED_ADDRESS);
  private readonly createRenderer = inject(WATERSHED_RENDERER);
  private readonly createComposer = inject(WATERSHED_COMPOSER);
  private readonly tiers = inject(WATERSHED_TIERS);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');
  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private camera?: THREE.PerspectiveCamera;
  private stage?: IStage;
  private storm?: IStorm;
  private resizeObserver?: ResizeObserver;
  private announcer?: ReturnType<typeof setInterval>;
  /** where the storm's clocks stood at the last frame, or null before a storm has run one */
  private frame: IStormFrame | null = null;
  /** how far the visitor has turned the orbit */
  private steering: ISteer = UNSTEERED;
  /** the pointer a drag is following, and where it was last */
  private dragging: { readonly id: number; x: number; y: number } | null = null;

  protected readonly webGLfailure = signal(false);
  /** null until the device has been probed, and again if the context is lost */
  protected readonly land = signal<LandState | null>(null);
  protected readonly seed = signal(HERO_SEED);
  protected readonly paused = signal(false);
  /** what the readout shows, to the nearest report; null until a storm has run */
  protected readonly readout = signal<IReadout | null>(null);
  /** the throttled one-sentence digest a screen reader hears; empty until the first is due */
  protected readonly announcement = signal('');
  protected readonly line = computed(() => {
    const land = this.land();
    return land === null ? null : landLine(land, this.seed(), this.paused());
  });
  protected readonly rows = computed(() => {
    const readout = this.readout();
    return readout === null ? null : readoutRows(readout);
  });

  /** a lost context is not restored: the loop stops and the page owns up, as it does when there never was one */
  private readonly onContextLost = (): void => {
    this.renderer?.setAnimationLoop(null);
    this.land.set(null);
    this.webGLfailure.set(true);
  };

  public ngAfterViewInit(): void {
    const canvas = this.canvas().nativeElement;
    const stage = createStage();
    this.stage = stage;
    const camera = createStageCamera(aspectOf(canvas.clientWidth, canvas.clientHeight));
    this.camera = camera;

    try {
      const renderer = this.createRenderer(canvas);
      this.renderer = renderer;
      calibrateRenderer(renderer, canvas.clientWidth, canvas.clientHeight);
      const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
      const land = landStateFor(reducedMotion, supportsFloatTargets(renderer));

      const composer = this.createComposer(renderer);
      this.composer = composer;
      const resolution = new THREE.Vector2(canvas.clientWidth, canvas.clientHeight);
      orchestratePasses(composer, stage.scene, camera, resolution, stage.air.rain);
      this.resizeObserver = followCanvasSize(canvas, renderer, composer, camera, reducedMotion);
      canvas.addEventListener('webglcontextlost', this.onContextLost);

      // a stored land is the hero seed's whatever the address says; only a live one is the visitor's own
      this.seed.set(
        showsStoredLand(land) ? HERO_SEED : (parseSeed(this.search) ?? drawSeed(this.random))
      );
      this.land.set(land);

      if (reducedMotion) {
        composer.render();
      } else {
        this.animate(renderer, composer, stage, land === 'simulating');
      }
      if (land === 'simulating') {
        // writing an identical sentence is a no-op on a signal, so a paused or finished storm goes quiet
        this.announcer = setInterval(() => {
          const readout = this.readout();
          if (readout !== null) {
            this.announcement.set(readoutDigest(readout));
          }
        }, ANNOUNCE_EVERY_MS);
      }
    } catch {
      this.webGLfailure.set(true);
    }
  }

  /**
   * the frame loop. it measures first and simulates second: the grid a storm runs on belongs to the quality
   * tier, so no storm starts until the meter has settled on one, and then it runs on that grid to the end.
   */
  private animate(
    renderer: THREE.WebGLRenderer,
    composer: EffectComposer,
    stage: IStage,
    simulating: boolean
  ): void {
    let meter = UNMEASURED;
    renderer.setAnimationLoop((nowMs) => {
      const measured = measure(meter, nowMs, this.tiers.length);
      if (measured.tier !== meter.tier) {
        this.drawAt(this.tiers[measured.tier].resolutionScale);
      }
      meter = measured;
      if (simulating && meter.settled) {
        this.storm ??= startStorm(renderer, stage, this.seed(), this.tiers[meter.tier]);
        this.frame = this.storm.advance(nowMs, this.paused());
        this.place(this.storm, this.frame);
        this.report(this.storm.readout);
      }
      composer.render();
    });
  }

  /** stands the camera where the path says it is at these clocks */
  private place(storm: IStorm, frame: IStormFrame): void {
    const pose = cameraAt(
      frame.progress,
      frame.ended,
      storm.valley,
      this.steering,
      VANTAGE,
      DIRECTION
    );
    this.camera?.position.set(...pose.eye);
    this.camera?.lookAt(...pose.target);
  }

  /** tells the readout how far the storm has got, every `REPORT_EVERY` steps and at its last, and each new read */
  private report(now: IReadout): void {
    const steps = now.steps === now.total ? now.steps : now.steps - (now.steps % REPORT_EVERY);
    const shown = this.readout();
    if (
      shown === null ||
      shown.steps !== steps ||
      shown.moved !== now.moved ||
      shown.exported !== now.exported
    ) {
      this.readout.set({ ...now, steps });
    }
  }

  /** **New land**: a new seed, in the address, and a storm started on it in the next frame */
  protected newLand(): void {
    const seed = drawSeed(this.random);
    this.address(seed);
    this.seed.set(seed);
    this.storm?.dispose();
    this.storm = undefined;
    this.frame = null;
    this.steering = UNSTEERED;
    this.dragging = null;
    this.paused.set(false);
    this.readout.set(null);
    this.announcement.set('');
  }

  protected togglePause(): void {
    this.paused.update((paused) => !paused);
  }

  /** true once the orbit has begun, which is when the visitor may turn it */
  private canSteer(): boolean {
    return this.frame !== null && steerable(this.frame.progress, this.frame.ended, DIRECTION);
  }

  private turnBy(yaw: number, pitch: number): void {
    this.steering = steer(this.steering, yaw, pitch, DIRECTION);
    if (this.storm && this.frame) {
      // drawn at once, so a turn shows on a paused orbit too
      this.place(this.storm, this.frame);
    }
  }

  /** an arrow key turns the orbit, once it has begun; before then the key is left to the page */
  protected turn(event: KeyboardEvent): void {
    const arrow = ARROWS[event.key] as readonly [number, number] | undefined;
    if (arrow === undefined || !this.canSteer()) {
      return;
    }
    event.preventDefault();
    this.turnBy(arrow[0] * DIRECTION.keyTurn, arrow[1] * DIRECTION.keyTurn);
  }

  protected grab(event: PointerEvent): void {
    if (this.canSteer()) {
      this.dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }

  protected drag(event: PointerEvent): void {
    const dragging = this.dragging;
    if (dragging === null || dragging.id !== event.pointerId) {
      return;
    }
    const dx = event.clientX - dragging.x;
    const dy = event.clientY - dragging.y;
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    this.turnBy(dx * DIRECTION.dragTurn, dy * DIRECTION.dragTurn);
  }

  protected letGo(): void {
    this.dragging = null;
  }

  public ngOnDestroy(): void {
    this.canvas().nativeElement.removeEventListener('webglcontextlost', this.onContextLost);
    clearInterval(this.announcer);
    this.resizeObserver?.disconnect();
    this.storm?.dispose();
    if (this.stage) {
      disposeStage(this.stage);
    }
    if (this.composer) {
      disposeComposer(this.composer);
    }
    if (this.renderer) {
      disposeRenderer(this.renderer);
    }
  }

  /** redraws at a fraction of the capped pixel ratio; the composer resizes every pass's buffers to match */
  private drawAt(resolutionScale: number): void {
    const pixelRatio = Math.min(window.devicePixelRatio, PIXEL_RATIO_FLOOR) * resolutionScale;
    this.renderer?.setPixelRatio(pixelRatio);
    this.composer?.setPixelRatio(pixelRatio);
  }
}
