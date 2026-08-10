import { TestBed } from '@angular/core/testing';
import { DashboardApiService, IMetrics } from './dashboard-api.service';
import { environment } from '../../environments/environment';

/**
 * Minimal controllable WebSocket stand-in. The real global WebSocket cannot be
 * driven deterministically under jsdom, so we swap in this fake and fire its
 * handlers by hand to exercise the service's message/error wiring.
 */
class FakeWebSocket {
  public static last: FakeWebSocket | null = null;

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((error: unknown) => void) | null = null;
  public onclose: (() => void) | null = null;
  public closed = false;

  constructor(public url: string) {
    FakeWebSocket.last = this;
  }

  public close(): void {
    this.closed = true;
    this.onclose?.();
  }
}

const sampleMetrics: IMetrics = {
  timestamp: '2026-08-09T00:00:00',
  occupancy: 66.67,
  guestsInHouse: 42,
  revenueToday: 1234.5,
  arrivalsToday: 7,
  departuresToday: 5,
  occupiedRooms: 2,
  availableRooms: 1,
  operationalRooms: 3,
  totalRooms: 4,
  adr: 617.25,
  revpar: 411.5,
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
        historicalGuests: [{ timestamp: '2026-08-09', value: 4 }],
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

    it('keeps the stream alive on a socket error (no error/complete)', () => {
      let errored = false;
      let completed = false;
      service.connectWebSocket().subscribe({
        error: () => (errored = true),
        complete: () => (completed = true),
      });

      FakeWebSocket.last!.onerror?.(new Error('socket boom'));

      // An error must not tear the stream down — reconnection handles recovery.
      expect(errored).toBe(false);
      expect(completed).toBe(false);
    });

    it('reconnects automatically after the socket drops', () => {
      vi.useFakeTimers();
      try {
        const received: IMetrics[] = [];
        service.connectWebSocket().subscribe((m) => received.push(m));

        const first = FakeWebSocket.last!;
        // Simulate the backend going away (e.g. restart).
        first.onclose?.();

        // Reconnect is scheduled, not immediate.
        expect(FakeWebSocket.last).toBe(first);

        vi.advanceTimersByTime(1000); // INITIAL_RECONNECT_DELAY_MS
        const second = FakeWebSocket.last!;
        expect(second).not.toBe(first);

        // The same observable keeps delivering after the reconnect.
        second.onmessage?.({ data: JSON.stringify(sampleMetrics) });
        expect(received).toEqual([sampleMetrics]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('backs off exponentially across repeated failures', () => {
      vi.useFakeTimers();
      try {
        service.connectWebSocket().subscribe();
        const first = FakeWebSocket.last!;

        first.onclose?.();
        vi.advanceTimersByTime(999);
        expect(FakeWebSocket.last).toBe(first); // still waiting on the 1000ms delay
        vi.advanceTimersByTime(1);
        const second = FakeWebSocket.last!;
        expect(second).not.toBe(first);

        // Second consecutive failure -> the delay doubles to 2000ms.
        second.onclose?.();
        vi.advanceTimersByTime(1999);
        expect(FakeWebSocket.last).toBe(second);
        vi.advanceTimersByTime(1);
        expect(FakeWebSocket.last).not.toBe(second);
      } finally {
        vi.useRealTimers();
      }
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

    it('stops reconnecting once disconnected', () => {
      vi.useFakeTimers();
      try {
        service.connectWebSocket().subscribe();
        const first = FakeWebSocket.last!;

        first.onclose?.(); // schedules a reconnect
        service.disconnectWebSocket(); // ...which this must cancel

        vi.advanceTimersByTime(60000);
        expect(FakeWebSocket.last).toBe(first); // no new socket was opened
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
