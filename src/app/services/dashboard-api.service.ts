import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Interface for metrics data from backend
 */
export interface IMetrics {
  activeUsers: number;
  revenue: number;
  requests: number;
  uptime: number;
  timestamp?: string;
}

/**
 * Interface for historical data points
 */
export interface IHistoricalData {
  timestamp: string;
  value: number;
}

/**
 * Interface for complete dashboard data
 */
export interface IDashboardData {
  metrics: IMetrics;
  historicalUsers: IHistoricalData[];
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
   * Connect to WebSocket for real-time metrics updates.
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
    if (!subject) {
      return;
    }

    this.ws = new WebSocket(this.WS_URL);

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
