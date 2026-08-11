import { DestroyRef, Directive, ElementRef, OnInit, inject } from '@angular/core';
import { prefersReducedMotion } from '../services/reduced-motion';

@Directive({
  selector: '[appScrollReveal]',
  standalone: true,
})
export class ScrollRevealDirective implements OnInit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  public ngOnInit(): void {
    // Under reduced motion, do not opt in at all. The `.scroll-reveal` class
    // parks the element at `opacity: 0` until the observer fires, so disabling
    // only the *transition* would leave content that never fades in and
    // therefore never appears. Skipping the class leaves the section rendered
    // normally from the first paint, which is the point of the setting.
    if (prefersReducedMotion()) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      {
        threshold: 0.15, // Trigger when 15% of element is visible
        rootMargin: '0px 0px -50px 0px', // Start animation slightly before element enters viewport
      }
    );

    this.el.nativeElement.classList.add('scroll-reveal');
    observer.observe(this.el.nativeElement);

    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
