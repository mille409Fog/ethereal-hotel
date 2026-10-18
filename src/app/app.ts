import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Navigation } from './navigation/navigation';
import { Hero } from './hero/hero';
import { Projects } from './projects/projects';
import { Experience } from './experience/experience';
import { Resume } from './resume/resume';
import { Footer } from './footer/footer';

@Component({
  selector: 'app-root',
  imports: [Navigation, Hero, Projects, Experience, Resume, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
