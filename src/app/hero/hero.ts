import { Component, inject } from '@angular/core';
import { ScrollService } from '../services/scroll.service';

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
})
export class Hero {
  private scrollService = inject(ScrollService);

  scrollTo(sectionId: string): void {
    this.scrollService.scrollTo(sectionId);
  }
}
