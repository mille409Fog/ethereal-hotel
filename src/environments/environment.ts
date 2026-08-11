/**
 * Development environment configuration.
 *
 * Used by default (`ng serve` / `ng build --configuration development`).
 * The production build swaps this file for `environment.prod.ts` via the
 * `fileReplacements` entry in `angular.json`.
 *
 * Local development runs the full stack — `python backend/main.py` — so unlike
 * the hosted demo it has a real WebSocket, and `pollIntervalMs` goes unused.
 */
import { IEnvironment } from './environment.model';

export const environment: IEnvironment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  wsUrl: 'ws://localhost:8000/ws',
  healthUrl: 'http://localhost:8000/',
  pollIntervalMs: 15000,
};
