import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

@Component({
  selector: 'app-resume',
  imports: [CommonModule, ScrollRevealDirective],
  templateUrl: './resume.html',
  styleUrl: './resume.css',
})
export class Resume {
}
