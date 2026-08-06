import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
    title: 'Real-Time Dashboard - Jacob Miller',
  },
  {
    path: '',
    loadComponent: () => import('./app').then((m) => m.App),
    title: 'Jacob Miller - Senior Software Engineer',
  },
];
