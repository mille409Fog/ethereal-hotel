import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FRAME, IProject, PROJECTS } from './projects.data';

@Component({
  selector: 'app-projects',
  templateUrl: './projects.html',
  styleUrl: './projects.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projects {
  public readonly projects: readonly IProject[] = PROJECTS;
  public readonly frame = FRAME;
}
