/**
 * Production environment configuration.
 *
 * Point these at your deployed FastAPI backend (Render / Fly.io / etc.).
 * Until a backend is live, the dashboard gracefully falls back to mock data,
 * so the frontend remains fully functional at the placeholder below.
 *
 * NOTE: keep the origin (scheme + host) consistent between the three URLs and
 * make sure it is listed in the backend's ALLOWED_ORIGINS env var.
 */
export const environment = {
  production: true,
  apiUrl: 'https://ethereal-hotel-api.onrender.com/api',
  wsUrl: 'wss://ethereal-hotel-api.onrender.com/ws',
  healthUrl: 'https://ethereal-hotel-api.onrender.com/',
};
