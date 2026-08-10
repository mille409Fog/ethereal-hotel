import { Subject } from 'rxjs';
import { Dashboard } from './dashboard';
import { IMetrics } from '../services/dashboard-api.service';

/**
 * These tests exercise the dashboard's data-source decision logic directly on
 * the component class (no template render needed): whether it uses the live
 * backend WebSocket or falls back to locally generated mock data.
 */
describe('Dashboard (backend vs. mock fallback)', () => {
  let wsSubject: Subject<IMetrics>;
  let api: {
    checkBackendHealth: ReturnType<typeof vi.fn>;
    connectWebSocket: ReturnType<typeof vi.fn>;
    disconnectWebSocket: ReturnType<typeof vi.fn>;
  };

  const makeComponent = (): Dashboard =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Dashboard(api as any);

  const liveMetrics: IMetrics = {
    activeUsers: 55,
    revenue: 9000,
    requests: 12,
    uptime: 98.5,
    timestamp: '2026-08-09T00:00:00',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    wsSubject = new Subject<IMetrics>();
    api = {
      checkBackendHealth: vi.fn(),
      connectWebSocket: vi.fn().mockReturnValue(wsSubject.asObservable()),
      disconnectWebSocket: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the backend WebSocket when the backend is healthy', async () => {
    api.checkBackendHealth.mockResolvedValue(true);
    const component = makeComponent();

    await component.ngOnInit();

    expect(component.backendStatus).toBe('connected');
    expect(api.connectWebSocket).toHaveBeenCalledTimes(1);

    // Incoming socket data drives the metrics.
    wsSubject.next(liveMetrics);
    expect(component.metrics).toEqual({
      activeUsers: 55,
      revenue: 9000,
      requests: 12,
      uptime: 98.5,
    });

    component.ngOnDestroy();
  });

  it('falls back to mock data when the backend is unavailable', async () => {
    api.checkBackendHealth.mockResolvedValue(false);
    const component = makeComponent();

    await component.ngOnInit();

    expect(component.backendStatus).toBe('disconnected');
    expect(api.connectWebSocket).not.toHaveBeenCalled();

    // The mock generator runs on a 2s interval and stays within its bounds.
    vi.advanceTimersByTime(2000);
    expect(component.metrics.activeUsers).toBeGreaterThanOrEqual(800);
    expect(component.metrics.activeUsers).toBeLessThan(1300);
    expect(component.metrics.revenue).toBeGreaterThanOrEqual(15000);
    expect(component.metrics.revenue).toBeLessThan(20000);

    component.ngOnDestroy();
  });

  it('falls back to mock data when the WebSocket errors mid-stream', async () => {
    api.checkBackendHealth.mockResolvedValue(true);
    const component = makeComponent();

    await component.ngOnInit();
    expect(component.backendStatus).toBe('connected');

    // Simulate the socket dropping.
    wsSubject.error(new Error('socket dropped'));

    expect(component.backendStatus).toBe('disconnected');

    // Mock updates take over.
    vi.advanceTimersByTime(2000);
    expect(component.metrics.activeUsers).toBeGreaterThanOrEqual(800);
    expect(component.metrics.activeUsers).toBeLessThan(1300);

    component.ngOnDestroy();
  });

  it('disconnects the WebSocket on destroy when using the backend', async () => {
    api.checkBackendHealth.mockResolvedValue(true);
    const component = makeComponent();
    await component.ngOnInit();

    component.ngOnDestroy();

    expect(api.disconnectWebSocket).toHaveBeenCalledTimes(1);
  });
});
