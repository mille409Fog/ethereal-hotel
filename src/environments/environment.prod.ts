/**
 * Production environment configuration — the hosted demo on Vercel.
 *
 * The URLs are **relative on purpose**. The FastAPI app is deployed as a Python
 * function on this same Vercel project (`api/index.py`), so the API is served
 * from the origin the page was loaded from. That means no CORS preflight, no
 * `ALLOWED_ORIGINS` to keep in sync, and — the reason this file used to be
 * wrong — no hostname that can rot. Every preview deployment gets a working
 * backend at its own URL without anyone editing this file.
 *
 * `wsUrl` is null because a serverless function cannot hold a socket open. The
 * dashboard falls back to polling `/api/metrics` and labels itself accordingly;
 * the live stream is a feature of the container deployment, not the demo.
 * See "Transport and degradation" in ARCHITECTURE.md for the full picture.
 */
import { IEnvironment } from './environment.model';

export const environment: IEnvironment = {
  production: true,
  apiUrl: '/api',
  wsUrl: null,
  healthUrl: '/api/health',
  pollIntervalMs: 15000,
};
