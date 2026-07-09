import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollService } from './services/scroll.service';
import { Navigation } from './navigation/navigation';
import { Hero } from './hero/hero';

@Component({
  selector: 'app-root',
  imports: [CommonModule, Navigation, Hero],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private scrollService = inject(ScrollService);
  currentYear = new Date().getFullYear();

  scrollTo(sectionId: string): void {
    this.scrollService.scrollTo(sectionId);
  }
}
