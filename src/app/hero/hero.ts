import { Component, inject, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ScrollService } from '../services/scroll.service';

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
})
export class Hero implements OnInit, OnDestroy {
  private scrollService = inject(ScrollService);
  parallaxOffset = 0;

  ngOnInit(): void {
    this.updateParallax();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.updateParallax();
  }

  private updateParallax(): void {
    const scrolled = window.pageYOffset;
    // Parallax effect: moves slower than scroll (0.5 = half speed)
    this.parallaxOffset = scrolled * 0.5;
  }

  scrollTo(sectionId: string): void {
    this.scrollService.scrollTo(sectionId);
  }
}
