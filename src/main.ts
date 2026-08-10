import { ChangeDetectionStrategy, Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { appConfig } from './app/app.config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppRoot {}

bootstrapApplication(AppRoot, appConfig).catch((err) => console.error(err));
