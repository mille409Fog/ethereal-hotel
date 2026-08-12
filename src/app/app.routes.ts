import { Routes } from '@angular/router';
import routeMeta from '../route-meta.json';

// Titles come from `src/route-meta.json` rather than being written here,
// because they are not only the router's business: `scripts/emit-route-meta.mjs`
// stamps the same strings into a static HTML file per route at build time, so a
// crawler that never runs this code still gets the right card. Two copies of a
// title is exactly the kind of drift nobody notices until a preview card in
// Slack contradicts the page it links to.
const meta = routeMeta.routes;

export const routes: Routes = [
  {
    path: meta.dashboard.path,
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
    title: meta.dashboard.title,
  },
  {
    path: meta.booking.path,
    loadComponent: () => import('./booking/booking').then((m) => m.Booking),
    title: meta.booking.title,
  },
  {
    path: meta.work.path,
    loadComponent: () => import('./work/work').then((m) => m.Work),
    title: meta.work.title,
  },
  {
    path: meta.home.path,
    loadComponent: () => import('./app').then((m) => m.App),
    title: meta.home.title,
  },
];
