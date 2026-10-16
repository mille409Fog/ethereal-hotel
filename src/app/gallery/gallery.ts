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
import { COLOURS, IColour, IPainting, ORBS_SHOWN } from './gallery.data';
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
