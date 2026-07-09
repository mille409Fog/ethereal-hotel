import { Component, inject } from '@angular/core';
import { ScrollService } from '../services/scroll.service';

@Component({
  selector: 'app-navigation',
  imports: [],
  templateUrl: './navigation.html',
  styleUrl: './navigation.css',
})
export class Navigation {
  private scrollService = inject(ScrollService);

  scrollTo(sectionId: string): void {
    this.scrollService.scrollTo(sectionId);
  }
}
