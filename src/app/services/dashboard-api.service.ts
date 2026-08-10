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

  private ws: WebSocket | null = null;
  private metricsSubject = new Subject<IMetrics>();

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
   * Connect to WebSocket for real-time metrics updates
   * @returns Observable that emits metrics updates
   */
  public connectWebSocket(): Observable<IMetrics> {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.WS_URL);

    this.ws.onopen = () => {
      // WebSocket connected successfully
    };

    this.ws.onmessage = (event) => {
      try {
        const metrics: IMetrics = JSON.parse(event.data);
        this.metricsSubject.next(metrics);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      this.metricsSubject.error(error);
    };

    this.ws.onclose = () => {
      // WebSocket disconnected
    };

    return this.metricsSubject.asObservable();
  }

  /**
   * Close WebSocket connection
   */
  public disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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
