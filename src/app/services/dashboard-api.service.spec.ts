import { TestBed } from '@angular/core/testing';
import { DashboardApiService, IMetrics } from './dashboard-api.service';
import { environment } from '../../environments/environment';

/**
 * Minimal controllable WebSocket stand-in. The real global WebSocket cannot be
 * driven deterministically under jsdom, so we swap in this fake and fire its
 * handlers by hand to exercise the service's message/error wiring.
 */
class FakeWebSocket {
  static last: FakeWebSocket | null = null;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.last = this;
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }
}

const sampleMetrics: IMetrics = {
  activeUsers: 42,
  revenue: 1234.5,
  requests: 7,
  uptime: 99.9,
  timestamp: '2026-08-09T00:00:00',
};

describe('DashboardApiService', () => {
  let service: DashboardApiService;
  let fetchSpy: ReturnType<typeof vi.fn>;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DashboardApiService);

    fetchSpy = vi.fn();
    vi.spyOn(window, 'fetch').mockImplementation(fetchSpy as typeof window.fetch);

    FakeWebSocket.last = null;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.WebSocket = originalWebSocket;
  });

  describe('getMetrics', () => {
    it('fetches and returns parsed metrics from the API', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => sampleMetrics });

      const result = await service.getMetrics();

      expect(fetchSpy).toHaveBeenCalledWith(`${environment.apiUrl}/metrics`);
      expect(result).toEqual(sampleMetrics);
    });

    it('throws when the response status is not ok', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(service.getMetrics()).rejects.toThrow('HTTP error! status: 500');
    });

    it('propagates network errors', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));

      await expect(service.getMetrics()).rejects.toThrow('network down');
    });
  });

  describe('getDashboard', () => {
    it('fetches and returns parsed dashboard data', async () => {
      const dashboard = {
        metrics: sampleMetrics,
        historicalUsers: [{ timestamp: '2026-08-09', value: 4 }],
        historicalRevenue: [{ timestamp: '2026-08-09', value: 300 }],
      };
      fetchSpy.mockResolvedValue({ ok: true, json: async () => dashboard });

      const result = await service.getDashboard();

      expect(fetchSpy).toHaveBeenCalledWith(`${environment.apiUrl}/dashboard`);
      expect(result).toEqual(dashboard);
    });

    it('throws when the response status is not ok', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

      await expect(service.getDashboard()).rejects.toThrow('HTTP error! status: 404');
    });
  });

  describe('checkBackendHealth', () => {
    it('returns true when the health endpoint responds ok', async () => {
      fetchSpy.mockResolvedValue({ ok: true });

      await expect(service.checkBackendHealth()).resolves.toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(environment.healthUrl);
    });

    it('returns false when the health endpoint is not ok', async () => {
      fetchSpy.mockResolvedValue({ ok: false });

      await expect(service.checkBackendHealth()).resolves.toBe(false);
    });

    it('returns false when the request throws', async () => {
      fetchSpy.mockRejectedValue(new Error('refused'));

      await expect(service.checkBackendHealth()).resolves.toBe(false);
    });
  });

  describe('connectWebSocket', () => {
    it('opens a socket at the configured URL and emits parsed messages', () => {
      const received: IMetrics[] = [];
      service.connectWebSocket().subscribe((m) => received.push(m));

      const socket = FakeWebSocket.last!;
      expect(socket.url).toBe(environment.wsUrl);

      socket.onmessage?.({ data: JSON.stringify(sampleMetrics) });

      expect(received).toEqual([sampleMetrics]);
    });

    it('ignores malformed messages without emitting', () => {
      const received: IMetrics[] = [];
      let errored = false;
      service.connectWebSocket().subscribe({
        next: (m) => received.push(m),
        error: () => (errored = true),
      });

      FakeWebSocket.last!.onmessage?.({ data: 'not-json{' });

      expect(received).toHaveLength(0);
      expect(errored).toBe(false);
    });

    it('surfaces socket errors on the observable', () => {
      let caught: unknown = null;
      service.connectWebSocket().subscribe({ error: (e) => (caught = e) });

      const boom = new Error('socket boom');
      FakeWebSocket.last!.onerror?.(boom);

      expect(caught).toBe(boom);
    });

    it('closes any existing socket before opening a new one', () => {
      service.connectWebSocket().subscribe();
      const first = FakeWebSocket.last!;

      service.connectWebSocket().subscribe();
      const second = FakeWebSocket.last!;

      expect(first.closed).toBe(true);
      expect(second).not.toBe(first);
    });
  });

  describe('disconnectWebSocket', () => {
    it('closes the active socket', () => {
      service.connectWebSocket().subscribe();
      const socket = FakeWebSocket.last!;

      service.disconnectWebSocket();

      expect(socket.closed).toBe(true);
    });
  });
});
