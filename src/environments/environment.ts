/**
 * Development environment configuration.
 *
 * Used by default (`ng serve` / `ng build --configuration development`).
 * The production build swaps this file for `environment.prod.ts` via the
 * `fileReplacements` entry in `angular.json`.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  wsUrl: 'ws://localhost:8000/ws',
  healthUrl: 'http://localhost:8000/',
};
