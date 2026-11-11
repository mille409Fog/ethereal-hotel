/**
 * `/watershed`: a landscape eroded by a simulation while the visitor watches. `WATERSHED.md` is the plan.
 *
 * this is the stage and nothing on it yet. the component assembles a renderer, the post-processing chain, a
 * camera and a placeholder slab, finds out whether the device can run the simulation, chooses a quality tier from
 * measured frame time, and says on screen which of the three land states the visitor is in. it owns nothing clever:
 * each of those is a module with its own spec, and this file is the order they happen in.
 *
 * two things are decided once, at the start, and never revisited. reduced motion is read once, so a visitor who
 * asked for stillness gets one frame and no loop. and the land state is fixed before the first frame, because a
 * piece that changed its mind about whether it was simulating would have to say so mid-sentence.
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
import { landLine, LandState, landStateFor, showsStoredLand } from './land-state';
import { EROSION } from './model/erosion-calibration';
import { measure, UNMEASURED } from './quality/quality-meter';
import { drawSeed, HERO_SEED, parseSeed } from './seed/seed';
import { REPORT_EVERY } from './sim/sim-calibration';
import { supportsFloatTargets } from './sim/sim-support';
import { IStorm, startStorm } from './sim/storm';
import { createStage, disposeStage, IStage } from './stage/create-stage';
import { aspectOf, createStageCamera } from './stage/stage-camera';
import {
  WATERSHED_COMPOSER,
  WATERSHED_RANDOM,
  WATERSHED_RENDERER,
  WATERSHED_SEARCH,
  WATERSHED_TIERS,
} from './watershed.tokens';

@Component({
  imports: [HomeLink],
  selector: 'app-watershed',
  styleUrl: './watershed.css',
  templateUrl: './watershed.html',
})
export class Watershed implements AfterViewInit, OnDestroy {
  private readonly random = inject(WATERSHED_RANDOM);
  private readonly search = inject(WATERSHED_SEARCH);
  private readonly createRenderer = inject(WATERSHED_RENDERER);
  private readonly createComposer = inject(WATERSHED_COMPOSER);
  private readonly tiers = inject(WATERSHED_TIERS);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');
  private renderer?: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  private stage?: IStage;
  private storm?: IStorm;
  private resizeObserver?: ResizeObserver;
  protected readonly webGLfailure = signal(false);
  /** null until the device has been probed, and again if the context is lost */
  protected readonly land = signal<LandState | null>(null);
  protected readonly seed = signal(HERO_SEED);
  /** how far the storm has got, to the nearest report; the frame loop knows the exact count */
  protected readonly steps = signal(0);
  protected readonly line = computed(() => {
    const land = this.land();
    return land === null
      ? null
      : landLine(land, this.seed(), { steps: this.steps(), total: EROSION.stormSteps });
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

    try {
      const renderer = this.createRenderer(canvas);
      this.renderer = renderer;
      calibrateRenderer(renderer, canvas.clientWidth, canvas.clientHeight);
      const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
      const land = landStateFor(reducedMotion, supportsFloatTargets(renderer));

      const composer = this.createComposer(renderer);
      this.composer = composer;
      const resolution = new THREE.Vector2(canvas.clientWidth, canvas.clientHeight);
      orchestratePasses(composer, stage.scene, camera, resolution);
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
        this.report(this.storm.advance(nowMs), this.storm.total);
      }
      composer.render();
    });
  }

  /** tells the state line how far the storm has got, every `REPORT_EVERY` steps and at its last */
  private report(done: number, total: number): void {
    const said = done === total ? done : done - (done % REPORT_EVERY);
    if (said !== this.steps()) {
      this.steps.set(said);
    }
  }

  public ngOnDestroy(): void {
    this.canvas().nativeElement.removeEventListener('webglcontextlost', this.onContextLost);
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
