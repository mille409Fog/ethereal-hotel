import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import {
  COLOURS,
  filesOf,
  IColour,
  IPainting,
  ORBS_SHOWN,
  PHONE_FRAME_INSET,
} from './gallery.data';
import { offerColours, Random, recommend } from './recommend';

/**
 * Where the gallery's chance comes from. `Math.random` in the app; tests
 * provide a fixed sequence, so "pick an orb, get a painting" is a statement
 * about a known painting rather than any of four.
 */
export const GALLERY_RANDOM = new InjectionToken<Random>('GALLERY_RANDOM', {
  factory: () => Math.random,
});

/**
 * `/gallery`: choose a colour and a painting from that colour's group is hung.
 *
 * A portfolio section, not part of the dashboard/booking argument: it reads no
 * API and writes nothing. Everything it shows is compiled in from
 * `gallery.data.ts`, and how it chooses is in `recommend.ts`, which the page
 * states in plain words beneath the orbs.
 *
 * Like `/work` it owns a `main` landmark, since it is the whole route.
 */
@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  styleUrl: './gallery.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Gallery {
  private readonly random = inject(GALLERY_RANDOM);
  private readonly injector = inject(Injector);

  /**
   * The heading of the hung painting. Focus moves here on every choice: the
   * picture appears below the orbs, out of view on a phone, and a keyboard or
   * screen reader user would otherwise be left on a button whose result they
   * cannot perceive.
   */
  private readonly paintingHeading = viewChild<ElementRef<HTMLElement>>('paintingHeading');

  /**
   * The hung painting as a whole. Focus alone is not enough on a desktop: the
   * heading is often just inside the viewport, so the browser does not scroll,
   * and the picture itself stays below the fold.
   */
  private readonly hung = viewChild<ElementRef<HTMLElement>>('hung');

  public readonly offered = signal<readonly IColour[]>(
    offerColours(COLOURS, ORBS_SHOWN, this.random)
  );
  public readonly colour = signal<IColour | null>(null);
  public readonly painting = signal<IPainting | null>(null);

  /**
   * The chosen colour's palette as custom properties on the card. Everything
   * inside reads these, so one binding re-dresses the whole room, and the frame
   * style is a `data-frame` attribute alongside it.
   */
  public readonly room = computed((): Record<string, string> => {
    const palette = this.colour()?.palette;
    if (!palette) {
      return {};
    }
    return {
      '--room-surface': palette.surface,
      '--room-border': palette.border,
      '--room-text': palette.text,
      '--room-muted': palette.muted,
      '--room-accent': palette.accent,
      '--room-accent-text': palette.accentText,
      '--room-mat': palette.mat,
    };
  });

  /** Every committed size of a painting, for the browser to choose from. */
  public srcset(painting: IPainting): string {
    return filesOf(painting.image)
      .map((image) => `/gallery/${image.file} ${image.width}w`)
      .join(', ');
  }

  /**
   * How wide the painting will be drawn, which is what the browser multiplies
   * by the screen's density to choose from `srcset`. It mirrors `gallery.css`:
   * on a phone the card's width less its padding and frame, on a desktop the
   * picture column, and in both the height cap (60vh, 70vh) times the
   * painting's shape, because a tall portrait is held to the height and drawn
   * far narrower than its column. Each figure errs wide, never narrow: wide
   * costs a few bytes, narrow costs a blurred painting.
   *
   * On a phone the width taken off is exact rather than generous: 74px of
   * page padding (32), card padding (40) and card border (2), plus both sides
   * of this room's frame. Rounding it up "for safety" is what failed: 10px of
   * slack on a 3× phone is 30 device pixels, enough to step past the 1050 copy
   * and download the full-size file, which the e2e profiles caught twice.
   * Larger screens widen the frames' `clamp()`s, which keeps the estimate on
   * the wide side there.
   */
  public sizes(painting: IPainting): string {
    const shape = (painting.image.width / painting.image.height).toFixed(4);
    // With no room chosen, assume the thinnest frame: it overstates the width,
    // which costs bytes, where a thicker guess would understate it and blur.
    const frame = this.colour()?.palette.frame ?? 'lacquer';
    const phoneChrome = 74 + 2 * PHONE_FRAME_INSET[frame];
    return (
      `(max-width: 860px) min(calc(100vw - ${phoneChrome}px), calc(60vh * ${shape})), ` +
      `min(36rem, 50vw, calc(70vh * ${shape}))`
    );
  }

  /** How many other paintings the chosen colour could still show. */
  public readonly others = computed(() => (this.colour()?.paintings.length ?? 1) - 1);

  /** Read from the data so the explanation cannot disagree with the collection. */
  public readonly paintingCount = COLOURS.reduce((sum, c) => sum + c.paintings.length, 0);
  public readonly colourCount = COLOURS.length;
  public readonly shownCount = Math.min(ORBS_SHOWN, COLOURS.length);
  public readonly smallestGroup = Math.min(...COLOURS.map((c) => c.paintings.length));
  public readonly largestGroup = Math.max(...COLOURS.map((c) => c.paintings.length));

  /**
   * Choose a colour. Choosing the one already chosen hangs a different painting
   * from it, which is what a second press on a lit orb most plausibly means.
   */
  public choose(colour: IColour): void {
    const previous = this.colour()?.id === colour.id ? this.painting()?.slug : undefined;
    this.colour.set(colour);
    this.hang(recommend(colour, this.random, previous));
  }

  /** Another painting of the same colour; never the one already showing. */
  public another(): void {
    const colour = this.colour();
    if (colour) {
      this.hang(recommend(colour, this.random, this.painting()?.slug));
    }
  }

  /** A fresh draw of colours. Clears the wall, since its colour may be gone. */
  public reshuffle(): void {
    this.offered.set(offerColours(COLOURS, ORBS_SHOWN, this.random));
    this.colour.set(null);
    this.painting.set(null);
  }

  /** The name of the source the label was checked against, for its link text. */
  public sourceName(painting: IPainting): string {
    return painting.source.includes('metmuseum.org') ? 'The Met' : 'Wikipedia';
  }

  private hang(painting: IPainting): void {
    this.painting.set(painting);
    afterNextRender(
      () => {
        this.paintingHeading()?.nativeElement.focus({ preventScroll: true });
        // Smooth or instant according to `scroll-behavior` in styles.css,
        // which the reduced-motion block already sets to `auto`. The optional
        // call is for jsdom, which does not implement it.
        this.hung()?.nativeElement.scrollIntoView?.({ block: 'start' });
      },
      { injector: this.injector }
    );
  }
}
