/**
 * `/watershed`: a landscape eroded by a simulation while the visitor watches. `WATERSHED.md` is the plan.
 *
 * the component assembles a renderer, the post-processing chain, a camera, and the stage with its air, finds out
 * whether the device can run the simulation, chooses a quality tier from measured frame time, and says on screen
 * which of the three land states the visitor is in. it owns nothing clever: each of those is a module with its
 * own spec, and this file is the order they happen in.
 *
 * two things are decided once, at the start, and never revisited. reduced motion is read once, so a visitor who
 * asked for stillness gets one frame and no loop. and the land state is fixed before the first frame, because a
 * piece that changed its mind about whether it was simulating would have to say so mid-sentence.
 *
 * - **`simulating`**: a storm (`sim/storm.ts`) starts once the quality meter has settled and its land has been
 *   raised in a worker, and keeps its clocks. the meter goes on judging the storm, and may step down under it.
 * - **`stored`**: the stored land (`stored/stored-land.ts`) is fetched at once and stood on the stage with the
 *   storm over, and the camera flies the pass over it and then orbits. there is no storm to start again, so no
 *   **New land**; it can be paused.
 * - **`still`**: the stored land is fetched, stood at the hero moment, and drawn once. no loop is started.
 *
 * in each, this file asks the camera's path (`direction/camera-path.ts`) where to stand at the show's clocks. the
 * state line names a stored land only once it has been drawn, so a line that says one is shown is never ahead of
 * the picture. the visitor has three things to do, each real DOM: **New land**, which draws a seed, writes it into
 * the address and starts a storm on it; **Pause**, which stops the clocks; and, once the orbit has begun, a drag or
 * the arrow keys, which turn it.
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
import { drawWithSamples } from './composer/composer-samples';
import { orchestratePasses } from './composer/orchestrate-passes';
import {
  cameraAt,
  heroSeconds,
  IPose,
  ISteer,
  steer,
  steerable,
  UNSTEERED,
} from './direction/camera-path';
import { DIRECTION } from './direction/direction-calibration';
import { IReadout, readoutDigest, readoutRows } from './direction/readout';
import {
  landLine,
  LandState,
  landStateFor,
  pausable,
  showsStoredLand,
  UNLOADED,
} from './land-state';
import { EROSION } from './model/erosion-calibration';
import { IQualityMeter, measure, UNMEASURED } from './quality/quality-meter';
import { drawSeed, HERO_SEED, parseSeed } from './seed/seed';
import { IRaising } from './sim/raise-land';
import { ANNOUNCE_EVERY_MS, REPORT_EVERY } from './sim/sim-calibration';
import { supportsFloatTargets } from './sim/sim-support';
import { IStorm, startStorm } from './sim/storm';
import { createStage, disposeStage, IStage } from './stage/create-stage';
import { ILandShow, IStormFrame } from './stage/stand-land';
import { CAMERA_POSITION, CAMERA_TARGET } from './stage/stage-calibration';
import { aspectOf, createStageCamera } from './stage/stage-camera';
import { showStoredLand } from './stored/stored-land';
import {
  WATERSHED_ADDRESS,
  WATERSHED_COMPOSER,
  WATERSHED_RAISE,
  WATERSHED_RANDOM,
  WATERSHED_RENDERER,
  WATERSHED_SEARCH,
  WATERSHED_STORED_LAND,
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
  private readonly loadStoredLand = inject(WATERSHED_STORED_LAND);
  private readonly raiseLand = inject(WATERSHED_RAISE);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');
  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private camera?: THREE.PerspectiveCamera;
  private stage?: IStage;
  private storm?: IStorm;
  /** the land the next storm will run on, while it is being raised */
  private raising?: IRaising;
  /** the tier everything is drawn and simulated at now: an index into `tiers`, which only ever grows */
  private tier = 0;
  /** the meter that judges the storm while it runs, from the tier the empty stage settled on */
  private running: IQualityMeter = UNMEASURED;
  /** the stored land on the stage, in the two states that show one */
  private stored?: ILandShow;
  /** set on destroy, so a stored land that arrives after it is not stood on a stage that has gone */
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  private announcer?: ReturnType<typeof setInterval>;
  /** where the storm's clocks stood at the last frame, or null before a storm has run one */
  private frame: IStormFrame | null = null;
  /** how far the visitor has turned the orbit */
  private steering: ISteer = UNSTEERED;
  /** the pointer a drag is following, and where it was last */
  private dragging: { readonly id: number; x: number; y: number } | null = null;

  protected readonly webGLfailure = signal(false);
  /**
   * null until the device has been probed, and again if the context is lost. a state that shows the stored land
   * is set only once that land has been drawn, or has failed to load
   */
  protected readonly land = signal<LandState | null>(null);
  /** true when the stored land could not be fetched or decoded */
  protected readonly unloaded = signal(false);
  protected readonly seed = signal(HERO_SEED);
  protected readonly paused = signal(false);
  /** true while there is something moving that **Pause** would hold */
  protected readonly canPause = computed(() => {
    const land = this.land();
    return land !== null && pausable(land) && !this.unloaded();
  });
  /** what the readout shows, to the nearest report; null until a storm has run */
  protected readonly readout = signal<IReadout | null>(null);
  /** the throttled one-sentence digest a screen reader hears; empty until the first is due */
  protected readonly announcement = signal('');
  protected readonly line = computed(() => {
    const land = this.land();
    if (land === null) {
      return null;
    }
    return this.unloaded() ? UNLOADED : landLine(land, this.seed(), this.paused());
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
      drawWithSamples(composer, this.tiers[this.tier].samples);
      const resolution = new THREE.Vector2(canvas.clientWidth, canvas.clientHeight);
      orchestratePasses(composer, stage.scene, camera, resolution, stage.air.rain);
      this.resizeObserver = followCanvasSize(canvas, renderer, composer, camera, reducedMotion);
      canvas.addEventListener('webglcontextlost', this.onContextLost);

      // a stored land is the hero seed's whatever the address says; only a live one is the visitor's own
      this.seed.set(
        showsStoredLand(land) ? HERO_SEED : (parseSeed(this.search) ?? drawSeed(this.random))
      );

      if (showsStoredLand(land)) {
        this.standStoredLand(renderer, composer, stage, land);
      } else {
        this.land.set(land);
      }
      if (!reducedMotion) {
        this.animate(renderer, composer, stage, land);
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
   * the frame loop. it measures twice and simulates in between. the empty stage is measured first, and no storm
   * starts until that has settled, because the grid a storm runs on belongs to the tier. then the storm is measured
   * while it runs, starting from that tier and only stepping down: a step to a tier on the same grid is taken by the
   * running storm, and one to a smaller grid starts the storm again on it. frames with no storm running in them,
   * while its land is being raised, are not counted, since they are the empty stage again.
   */
  private animate(
    renderer: THREE.WebGLRenderer,
    composer: EffectComposer,
    stage: IStage,
    land: LandState
  ): void {
    let meter = UNMEASURED;
    renderer.setAnimationLoop((nowMs) => {
      if (!meter.settled) {
        const measured = measure(meter, nowMs, this.tiers.length);
        this.tierTo(measured.tier);
        meter = measured;
        this.running = { ...UNMEASURED, tier: meter.tier };
      }
      if (land === 'simulating' && meter.settled) {
        const storm = this.stormNow(renderer, stage);
        if (storm) {
          this.frame = storm.advance(nowMs, this.paused());
          this.place(storm, this.frame);
          this.report(storm.readout);
        }
        if (storm && !this.paused()) {
          this.measureStorm(nowMs);
        } else {
          // no storm yet, its land still being raised, or one held: either way the frame ran no step and says
          // nothing of what a storm costs, so the window starts again at the next frame that does
          this.running = {
            ...this.running,
            windowStartMs: null,
            lastMs: null,
            frames: 0,
            stalls: 0,
          };
        }
      }
      // the stored land's grid is the image's, not a tier's, so it does not wait for the meter
      const stored = this.stored;
      if (stored) {
        this.frame = stored.advance(nowMs, this.paused());
        this.place(stored, this.frame);
      }
      composer.render();
      if (stored && this.land() === null) {
        this.land.set(land);
      }
    });
  }

  /** the running storm, or one started on a land that has just been raised, or none while it is being raised */
  private stormNow(renderer: THREE.WebGLRenderer, stage: IStage): IStorm | undefined {
    if (this.storm) {
      return this.storm;
    }
    const tier = this.tiers[this.tier];
    this.raising ??= this.raiseLand(this.seed(), tier.grid, EROSION);
    const raised = this.raising.land;
    if (raised === null) {
      return undefined;
    }
    this.raising = undefined;
    this.storm = startStorm(renderer, stage, raised, tier);
    return this.storm;
  }

  /**
   * the storm's frame time, judged as the empty stage's was. a step down the running storm can take, it takes; a
   * step to a smaller grid ends it, and the next frame raises its land again on that grid, for the same seed
   */
  private measureStorm(nowMs: number): void {
    const measured = measure(this.running, nowMs, this.tiers.length);
    this.running = measured;
    const grid = this.tiers[this.tier].grid;
    if (!this.tierTo(measured.tier)) {
      return;
    }
    const tier = this.tiers[measured.tier];
    if (tier.grid === grid) {
      this.storm?.retier(tier);
      return;
    }
    this.endStorm();
  }

  /** moves to the tier at `index`, redrawing at its resolution and with its samples; true if it was a move */
  private tierTo(index: number): boolean {
    if (index === this.tier) {
      return false;
    }
    this.tier = index;
    const tier = this.tiers[index];
    this.drawAt(tier.resolutionScale);
    if (this.composer) {
      drawWithSamples(this.composer, tier.samples);
    }
    return true;
  }

  /** takes the storm and any land being raised for one away, and everything that showed it */
  private endStorm(): void {
    this.raising?.cancel();
    this.raising = undefined;
    this.storm?.dispose();
    this.storm = undefined;
    this.frame = null;
    this.readout.set(null);
    this.announcement.set('');
  }

  /**
   * fetches the stored land and stands it on the stage: at the hero moment and drawn once under reduced motion,
   * or at the storm's end for the loop to fly over. a land that cannot be loaded is owned up to on the line
   */
  private standStoredLand(
    renderer: THREE.WebGLRenderer,
    composer: EffectComposer,
    stage: IStage,
    land: LandState
  ): void {
    const still = land === 'still';
    this.loadStoredLand()
      .then((loaded) => {
        if (this.destroyed || this.webGLfailure()) {
          return;
        }
        const show = showStoredLand(renderer, stage, loaded, still ? heroSeconds(DIRECTION) : 0);
        this.stored = show;
        if (still) {
          this.frame = show.advance(window.performance.now());
          this.place(show, this.frame);
          composer.render();
          this.land.set(land);
        }
      })
      .catch(() => {
        if (this.destroyed || this.webGLfailure()) {
          return;
        }
        this.unloaded.set(true);
        this.land.set(land);
        if (still) {
          composer.render();
        }
      });
  }

  /** stands the camera where the path says it is at these clocks */
  private place(show: ILandShow, frame: IStormFrame): void {
    const pose = cameraAt(
      frame.progress,
      frame.ended,
      show.valley,
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
    this.endStorm();
    this.steering = UNSTEERED;
    this.dragging = null;
    this.paused.set(false);
  }

  protected togglePause(): void {
    this.paused.update((paused) => !paused);
  }

  /** true once the orbit has begun, which is when the visitor may turn it; a still frame has no orbit */
  private canSteer(): boolean {
    return (
      this.canPause() &&
      this.frame !== null &&
      steerable(this.frame.progress, this.frame.ended, DIRECTION)
    );
  }

  private turnBy(yaw: number, pitch: number): void {
    this.steering = steer(this.steering, yaw, pitch, DIRECTION);
    const show = this.storm ?? this.stored;
    if (show && this.frame) {
      // drawn at once, so a turn shows on a paused orbit too
      this.place(show, this.frame);
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
    this.destroyed = true;
    this.canvas().nativeElement.removeEventListener('webglcontextlost', this.onContextLost);
    clearInterval(this.announcer);
    this.resizeObserver?.disconnect();
    this.raising?.cancel();
    this.storm?.dispose();
    this.stored?.dispose();
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
