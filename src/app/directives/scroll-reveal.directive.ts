import { DestroyRef, Directive, ElementRef, OnInit, inject } from '@angular/core';

@Directive({
  selector: '[appScrollReveal]',
  standalone: true,
})
export class ScrollRevealDirective implements OnInit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  public ngOnInit(): void {
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
