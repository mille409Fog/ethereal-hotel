import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { prefersReducedMotion } from '../services/reduced-motion';

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
  host: {
    '(window:scroll)': 'onWindowScroll()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  /**
   * Vertical offset applied to the hero backdrop. A signal so the scroll
   * handler can drive the view under OnPush without a manual markForCheck.
   */
  public readonly parallaxOffset = signal(this.currentParallaxOffset());

  public onWindowScroll(): void {
    this.parallaxOffset.set(this.currentParallaxOffset());
  }

  /**
   * Parallax effect: the backdrop moves at half the scroll speed — and not at
   * all under reduced motion. This one is applied as an inline transform, so
   * the `prefers-reduced-motion` block in `styles.css` cannot reach it; pinning
   * the offset to 0 is what actually stops the backdrop from sliding.
   */
  private currentParallaxOffset(): number {
    return prefersReducedMotion() ? 0 : window.scrollY * 0.5;
  }
}
