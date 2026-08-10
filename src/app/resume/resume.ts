import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

@Component({
  selector: 'app-resume',
  imports: [ScrollRevealDirective],
  templateUrl: './resume.html',
  styleUrl: './resume.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Resume {}
