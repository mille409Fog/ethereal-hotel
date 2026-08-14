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
    // A separate work, and the only route whose component lives outside
    // `src/app/`. See AUBADE.md: it shares this deployment and nothing else —
    // no styles, no services, no tokens — and the import direction only ever
    // points this way. Lazy like the rest, and the component defers the
    // renderer behind a second dynamic import so no WebGL code is fetched, and
    // no context created, unless someone opens this route.
    path: meta.aubade.path,
    loadComponent: () => import('../aubade/aubade').then((m) => m.Aubade),
    title: meta.aubade.title,
  },
  {
    path: meta.home.path,
    loadComponent: () => import('./app').then((m) => m.App),
    title: meta.home.title,
  },
];
