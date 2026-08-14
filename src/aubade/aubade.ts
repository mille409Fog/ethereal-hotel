import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { FrameLoop, type IFrame } from './gl/loop';
import { prefersReducedMotion } from './reduced-motion';
import type { LobbyRenderer } from './renderer';

/**
 * `/aubade` — Floor 0, The Desk.
 *
 * The first room of a separate work. See `AUBADE.md`; the short version is that
 * this is a hotel that keeps the visitor's hours, rendered entirely by
 * raymarching signed distance fields, and this phase builds one room of it
 * properly before building any of the others badly.
 *
 * ## Three constraints this component exists to satisfy
 *
 * **It must not cost the rest of the site anything.** AUBADE's second
 * non-negotiable is that `/` and `/dashboard` Lighthouse scores do not move by a
 * point. So: a lazy route, and `renderer.ts` behind a dynamic `import()` rather
 * than a static one. The static import here is `import type`, which the compiler
 * erases — the renderer, the shader sources and everything in `gl/` land in
 * their own chunk that is fetched when someone actually opens this route. No
 * WebGL context is created before then, because the code that could create one
 * has not been downloaded.
 *
 * **Reduced motion is honoured at the concept level.** Not a slower camera — no
 * camera. The loop is never started; one frame is drawn and left. AUBADE's third
 * non-negotiable is explicit that the piece becomes a series of still
 * compositions, and a still raymarched interior is a perfectly good picture,
 * which is the reason that instruction is followable at all.
 *
 * **It degrades in the open.** No WebGL2, or a driver that rejects the shader,
 * and the room is written out in prose instead. The quality ladder's current
 * rung is printed on the plate under the frame rather than applied quietly. Both
 * are AUBADE's fourth non-negotiable: silent degradation is how a portfolio
 * piece gets remembered as the one that ran badly on somebody's laptop.
 *
 * The prose here is a placeholder for the Reader's Edition, which is its own
 * phase and is a real piece of writing rather than an alt attribute. Until then
 * this is what a screen reader, a blocked context and a dying battery all get,
 * and it is written to be worth reading on its own terms because that is the
 * standard the eventual one has to clear.
 */
@Component({
  selector: 'app-aubade',
  templateUrl: './aubade.html',
  styleUrl: './aubade.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Aubade implements AfterViewInit, OnDestroy {
  private readonly stage = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');

  /**
   * What the visitor is looking at.
   *
   * - `opening` — the renderer chunk is in flight. Lasts a few hundred
   *   milliseconds on a cold cache and nothing on a warm one.
   * - `running` — the room, breathing.
   * - `still` — the room, held. `prefers-reduced-motion`.
   * - `closed` — no WebGL2, or the driver would not take the shader. The prose.
   */
  public readonly mode = signal<'opening' | 'running' | 'still' | 'closed'>('opening');

  /** What the detail ladder has done, in the register's voice, or `null`. */
  public readonly note = signal<string | null>(null);

  private renderer: LobbyRenderer | null = null;
  private loop: FrameLoop | null = null;
  private observer: ResizeObserver | null = null;

  /**
   * Set before anything is torn down, and read by the async setup below. The
   * component can be destroyed while the renderer chunk is still in flight, and
   * without this that resolves into a GPU context nobody will ever release.
   */
  private destroyed = false;

  public async ngAfterViewInit(): Promise<void> {
    const canvas = this.stage().nativeElement;

    // The dynamic import is the point — see the class comment. It also means
    // this method is the first place in the application where a WebGL context
    // can possibly exist.
    const { LobbyRenderer } = await import('./renderer');
    const renderer = LobbyRenderer.create(canvas);

    if (renderer === null) {
      this.mode.set('closed');
      return;
    }

    // Destroyed while the chunk was in flight. Rare, entirely possible on a slow
    // connection and a fast reader, and it leaks a GPU context every time.
    if (this.destroyed) {
      renderer.dispose();
      return;
    }

    this.renderer = renderer;
    this.loop = new FrameLoop((frame) => {
      this.draw(frame);
    });

    this.watchSize(canvas, renderer);
    this.watchContextLoss(canvas);

    if (prefersReducedMotion()) {
      this.mode.set('still');
      this.loop.renderOnce();
      return;
    }

    this.mode.set('running');
    this.loop.start();
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.loop?.stop();
    this.observer?.disconnect();
    this.renderer?.dispose();
    this.renderer = null;
  }

  /** One frame, plus whatever the renderer wants said about it. */
  private draw(frame: IFrame): void {
    const renderer = this.renderer;
    if (renderer === null) {
      return;
    }

    if (!renderer.render(frame)) {
      // A lost context, or a disposed renderer. Stop rather than spin: a loop
      // calling into a dead context burns a core for as long as the tab is open
      // and draws nothing at all.
      this.loop?.stop();
      return;
    }

    const tier = renderer.report.tier;
    if (tier.note !== this.note()) {
      this.note.set(tier.note);
    }
  }

  /**
   * Re-measure on resize, and only on resize.
   *
   * `ResizeObserver` rather than a `window` resize listener: this fires for a
   * sidebar opening, a zoom change and a device-pixel-ratio change on a monitor
   * swap, none of which resize the window. It is also why `render()` never
   * touches the DOM — see the renderer's file comment.
   */
  private watchSize(canvas: HTMLCanvasElement, renderer: LobbyRenderer): void {
    this.observer = new ResizeObserver(() => {
      renderer.measure();
      // A stopped loop still has to repaint, or a reduced-motion visitor who
      // resizes the window is left looking at a stretched still.
      if (!this.loop?.running) {
        this.loop?.renderOnce();
      }
    });
    this.observer.observe(canvas);
  }

  /**
   * A lost context is not an error and is not rare: it happens on a GPU driver
   * update, on a laptop switching graphics, and on a browser deciding some other
   * tab needs the memory more. Saying so is better than a black rectangle.
   */
  private watchContextLoss(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('webglcontextlost', (event) => {
      // Without this the context is never eligible for restoration; the default
      // action of the event is to make the loss permanent.
      event.preventDefault();
      this.loop?.stop();
      this.mode.set('closed');
    });
  }
}
