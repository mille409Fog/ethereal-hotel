import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Where the numbers on screen are coming from: still probing, the live backend
 * over a socket, the live backend over REST polling, or the committed offline
 * fixture.
 *
 * `connected` and `polling` are both real data — the distinction is how fresh
 * it is, and the badge draws it because "live" would overclaim on a deployment
 * that re-reads every fifteen seconds.
 */
export type BackendStatus = 'checking' | 'connected' | 'polling' | 'disconnected';

/**
 * How this deployment receives metric updates. Determined by configuration
 * (`environment.wsUrl`), not by attempting a socket and seeing it fail.
 */
export type MetricsTransport = 'socket' | 'polling';

/**
 * Point-in-time hotel metrics, as returned by `GET /api/metrics` and pushed
 * over the `/ws` socket. Mirrors the `Metrics` model in `backend/schemas.py` —
 * every field is derived from real `Room`/`Guest`/`Booking` rows.
 */
export interface IMetrics {
  /** ISO timestamp of the moment the snapshot was computed. */
  timestamp: string;
  /** Occupied rooms as a percentage of *operational* rooms. */
  occupancy: number;
  /** Adults + children across every stay spanning tonight. */
  guestsInHouse: number;
  /** Room revenue recognised today, in USD. */
  revenueToday: number;
  arrivalsToday: number;
  departuresToday: number;
  occupiedRooms: number;
  /** Operational rooms not sold tonight. */
  availableRooms: number;
  /** Rooms in service — total minus those out for maintenance. */
  operationalRooms: number;
  totalRooms: number;
  /** Average Daily Rate: room revenue / occupied rooms. */
  adr: number;
  /** Revenue Per Available Room: room revenue / operational rooms. */
  revpar: number;
}

/**
 * One point in a daily series: an ISO date and the value recorded for it.
 */
export interface IHistoricalData {
  timestamp: string;
  value: number;
}

/**
 * Complete dashboard payload from `GET /api/dashboard`: the current snapshot
 * plus the trailing daily series the charts render.
 */
export interface IDashboardData {
  metrics: IMetrics;
  /** Guests in house per day. */
  historicalGuests: IHistoricalData[];
  /** Room revenue recognised per day, in USD. */
  historicalRevenue: IHistoricalData[];
}

/**
 * Service to connect to the Python FastAPI backend
 * Provides both REST API and WebSocket connections for real-time data
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardApiService {
  private readonly API_URL = environment.apiUrl;
  private readonly WS_URL = environment.wsUrl;

  // Reconnect backoff bounds. Each failed attempt doubles the delay from
  // INITIAL up to MAX, then holds at MAX until a connection succeeds.
  private static readonly INITIAL_RECONNECT_DELAY_MS = 1000;
  private static readonly MAX_RECONNECT_DELAY_MS = 30000;

  private ws: WebSocket | null = null;
  // Recreated per connection so a torn-down stream never blocks a fresh one.
  private metricsSubject: Subject<IMetrics> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollSubject: Subject<IMetrics> | null = null;

  /**
   * Which transport {@link streamMetrics} will use.
   *
   * Read from configuration rather than probed, so the dashboard can label the
   * data source correctly on first paint instead of after a socket times out.
   */
  public get transport(): MetricsTransport {
    return this.WS_URL === null ? 'polling' : 'socket';
  }

  /**
   * Subscribe to metric updates over whichever transport this deployment has.
   *
   * Callers do not care which one it is: both return an Observable that emits
   * snapshots until {@link stopStreaming} is called, and both survive a backend
   * that comes and goes.
   */
  public streamMetrics(): Observable<IMetrics> {
    return this.WS_URL === null ? this.pollMetrics() : this.connectWebSocket();
  }

  /**
   * Tear down whichever transport is running. Safe to call when none is.
   */
  public stopStreaming(): void {
    this.disconnectWebSocket();
    this.stopPolling();
  }

  /**
   * Poll `GET /api/metrics` on an interval — the transport for deployments
   * without a socket.
   *
   * A failed poll is swallowed rather than propagated: the next tick retries,
   * which mirrors how the socket transport treats a dropped connection. Erroring
   * the Observable would send the dashboard back to the fixture over one blip.
   */
  private pollMetrics(): Observable<IMetrics> {
    this.stopStreaming();

    const subject = new Subject<IMetrics>();
    this.pollSubject = subject;

    const read = async (): Promise<void> => {
      try {
        const metrics = await this.getMetrics();
        // Guard against a read that was in flight when polling was stopped.
        if (this.pollSubject === subject) {
          subject.next(metrics);
        }
      } catch {
        // Already logged by getMetrics. Next tick retries.
      }
    };

    // Read immediately so the first snapshot does not wait out a full interval.
    void read();
    this.pollTimer = setInterval(() => void read(), environment.pollIntervalMs);

    return subject.asObservable();
  }

  /** Stop the polling transport and complete its stream. */
  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.pollSubject) {
      this.pollSubject.complete();
      this.pollSubject = null;
    }
  }

  /**
   * Get current metrics via REST API
   */
  public async getMetrics(): Promise<IMetrics> {
    try {
      const response = await window.fetch(`${this.API_URL}/metrics`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching metrics:', error);
      throw error;
    }
  }

  /**
   * Get complete dashboard data via REST API
   */
  public async getDashboard(): Promise<IDashboardData> {
    try {
      const response = await window.fetch(`${this.API_URL}/dashboard`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      throw error;
    }
  }

  /**
   * Connect to WebSocket for real-time metrics updates — the socket transport.
   *
   * Prefer {@link streamMetrics}, which picks this or polling based on what the
   * deployment supports. This stays public because it is meaningful on its own
   * and is exercised directly by its tests.
   *
   * The returned stream survives dropped connections: if the socket errors or
   * closes (e.g. the backend restarts), it automatically reconnects with an
   * exponential backoff and keeps emitting on the same Observable. A fresh
   * Subject is created per connection so a previously torn-down stream can't
   * leave this one dead.
   *
   * @returns Observable that emits metrics updates
   */
  public connectWebSocket(): Observable<IMetrics> {
    // Drop any existing connection/stream before starting a new one.
    this.disconnectWebSocket();

    this.metricsSubject = new Subject<IMetrics>();
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.openSocket();

    return this.metricsSubject.asObservable();
  }

  /**
   * Open a socket for the current stream and wire reconnection off its close.
   */
  private openSocket(): void {
    const subject = this.metricsSubject;
    const url = this.WS_URL;
    if (!subject || url === null) {
      return;
    }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      // Healthy connection — reset the backoff for the next disconnect.
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const metrics: IMetrics = JSON.parse(event.data);
        subject.next(metrics);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      // Log only. A socket error is followed by a close event, which is what
      // drives reconnection — erroring the Subject here would kill the stream.
      console.error('❌ WebSocket error:', error);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Schedule the next reconnect attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    const delay = Math.min(
      DashboardApiService.INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      DashboardApiService.MAX_RECONNECT_DELAY_MS
    );
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.openSocket();
      }
    }, delay);
  }

  /**
   * Close the WebSocket connection and stop reconnecting.
   */
  public disconnectWebSocket(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Detach handlers so this intentional close doesn't trigger a reconnect.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    if (this.metricsSubject) {
      this.metricsSubject.complete();
      this.metricsSubject = null;
    }

    this.reconnectAttempts = 0;
  }

  /**
   * Check if backend is available
   */
  public async checkBackendHealth(): Promise<boolean> {
    try {
      const response = await window.fetch(environment.healthUrl);
      return response.ok;
    } catch (error) {
      console.error('Backend not available:', error);
      return false;
    }
  }
}
