import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ScrollService } from '../services/scroll.service';

@Component({
  selector: 'app-navigation',
  imports: [],
  templateUrl: './navigation.html',
  styleUrl: './navigation.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Navigation {
  private readonly scrollService = inject(ScrollService);

  public scrollTo(sectionId: string): void {
    this.scrollService.scrollTo(sectionId);
  }
}
