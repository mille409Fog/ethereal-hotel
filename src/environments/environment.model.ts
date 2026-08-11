/**
 * The shape both environment files must satisfy.
 *
 * It exists because the two deployments genuinely differ — the hosted demo has
 * no WebSocket and addresses the API relatively, the local stack has both — and
 * without a shared type that difference would be expressed as two object
 * literals that happen to have different keys. `ng build` only ever compiles
 * one of them, so a field added to `environment.ts` and forgotten in
 * `environment.prod.ts` would typecheck locally and fail in production.
 */
export interface IEnvironment {
  production: boolean;

  /** Base URL for the REST API. Relative (`/api`) when same-origin. */
  apiUrl: string;

  /**
   * WebSocket URL for the live metrics stream, or `null` when the deployment
   * cannot serve one — a Vercel function has no process to hold a socket open.
   * `null` is not "not configured yet": it is the client's instruction to use
   * the REST polling transport instead, and the dashboard says so on screen.
   */
  wsUrl: string | null;

  /** Health probe. Decides whether the app shows real data or the fixture. */
  healthUrl: string;

  /**
   * How often the polling transport re-reads `/metrics`. Only consulted when
   * `wsUrl` is null. This is a cost dial as much as a freshness one: on
   * serverless each poll is a billed invocation, so it is deliberately slower
   * than the 2s socket cadence rather than an imitation of it.
   */
  pollIntervalMs: number;
}
