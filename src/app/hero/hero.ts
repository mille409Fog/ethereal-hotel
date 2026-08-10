import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ScrollService } from '../services/scroll.service';

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
  private readonly scrollService = inject(ScrollService);

  /**
   * Vertical offset applied to the hero backdrop. A signal so the scroll
   * handler can drive the view under OnPush without a manual markForCheck.
   */
  public readonly parallaxOffset = signal(this.currentParallaxOffset());

  public onWindowScroll(): void {
    this.parallaxOffset.set(this.currentParallaxOffset());
  }

  public scrollTo(sectionId: string): void {
    this.scrollService.scrollTo(sectionId);
  }

  /** Parallax effect: the backdrop moves at half the scroll speed. */
  private currentParallaxOffset(): number {
    return window.scrollY * 0.5;
  }
}
