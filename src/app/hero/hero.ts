import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {}
