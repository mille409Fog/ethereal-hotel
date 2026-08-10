import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { Dashboard } from './dashboard';
import { DashboardApiService, IDashboardData, IMetrics } from '../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../services/offline-dashboard.fixture';

/**
 * These tests exercise the dashboard's data-source decision logic directly on
 * the component class (no template render needed): whether it uses the live
 * backend WebSocket or falls back to the committed offline fixture.
 *
 * The component is built inside a TestBed injection context rather than with
 * `new`, because it resolves its dependencies with `inject()`.
 */

/** What a healthy backend returns, as distinct from the offline fixture. */
const liveMetrics: IMetrics = {
  timestamp: '2026-08-09T00:00:00',
  occupancy: 66.67,
  guestsInHouse: 4,
  revenueToday: 300,
  arrivalsToday: 1,
  departuresToday: 2,
  occupiedRooms: 2,
  availableRooms: 1,
  operationalRooms: 3,
  totalRooms: 4,
  adr: 150,
  revpar: 100,
};

const liveDashboard: IDashboardData = {
  metrics: liveMetrics,
  historicalGuests: [{ timestamp: '2026-08-09', value: 4 }],
  historicalRevenue: [{ timestamp: '2026-08-09', value: 300 }],
};

describe('Dashboard (backend vs. offline fixture)', () => {
  let wsSubject: Subject<IMetrics>;
  let api: {
    checkBackendHealth: ReturnType<typeof vi.fn>;
    getDashboard: ReturnType<typeof vi.fn>;
    connectWebSocket: ReturnType<typeof vi.fn>;
    disconnectWebSocket: ReturnType<typeof vi.fn>;
  };

  const makeComponent = (): Dashboard => TestBed.runInInjectionContext(() => new Dashboard());

  beforeEach(() => {
    wsSubject = new Subject<IMetrics>();
    api = {
      checkBackendHealth: vi.fn(),
      getDashboard: vi.fn().mockResolvedValue(liveDashboard),
      connectWebSocket: vi.fn().mockReturnValue(wsSubject.asObservable()),
      disconnectWebSocket: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardApiService, useValue: api }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the backend WebSocket when the backend is healthy', async () => {
    api.checkBackendHealth.mockResolvedValue(true);
    const component = makeComponent();

    await component.ngOnInit();

    expect(component.backendStatus()).toBe('connected');
    expect(api.connectWebSocket).toHaveBeenCalledTimes(1);

    // The REST read seeds the historical series the charts render.
    expect(component.historicalGuests()).toEqual(liveDashboard.historicalGuests);
    expect(component.historicalRevenue()).toEqual(liveDashboard.historicalRevenue);

    // Incoming socket data drives the metrics.
    wsSubject.next(liveMetrics);
    expect(component.metrics()).toEqual(liveMetrics);

    component.ngOnDestroy();
  });

  it('falls back to the committed fixture when the backend is unavailable', async () => {
    api.checkBackendHealth.mockResolvedValue(false);
    const component = makeComponent();

    await component.ngOnInit();

    expect(component.backendStatus()).toBe('disconnected');
    expect(api.connectWebSocket).not.toHaveBeenCalled();
    expect(component.metrics()).toEqual(OFFLINE_DASHBOARD.metrics);
    expect(component.historicalGuests()).toEqual(OFFLINE_DASHBOARD.historicalGuests);
    expect(component.historicalRevenue()).toEqual(OFFLINE_DASHBOARD.historicalRevenue);

    component.ngOnDestroy();
  });

  it('serves the same fixture values on every run (no RNG)', async () => {
    api.checkBackendHealth.mockResolvedValue(false);

    const first = makeComponent();
    await first.ngOnInit();
    const second = makeComponent();
    await second.ngOnInit();

    expect(first.metrics()).toEqual(second.metrics());
    expect(first.metrics().occupancy).toBe(OFFLINE_DASHBOARD.metrics.occupancy);

    first.ngOnDestroy();
    second.ngOnDestroy();
  });

  it('keeps the fixture history when the backend health check passes but the read fails', async () => {
    api.checkBackendHealth.mockResolvedValue(true);
    api.getDashboard.mockRejectedValue(new Error('500'));
    const component = makeComponent();

    await component.ngOnInit();

    expect(component.backendStatus()).toBe('connected');
    expect(component.historicalGuests()).toEqual(OFFLINE_DASHBOARD.historicalGuests);
    // The socket still drives the live snapshot.
    wsSubject.next(liveMetrics);
    expect(component.metrics()).toEqual(liveMetrics);

    component.ngOnDestroy();
  });

  it('falls back to the fixture when the WebSocket errors mid-stream', async () => {
    api.checkBackendHealth.mockResolvedValue(true);
    const component = makeComponent();

    await component.ngOnInit();
    expect(component.backendStatus()).toBe('connected');

    // Simulate the socket dropping.
    wsSubject.error(new Error('socket dropped'));

    expect(component.backendStatus()).toBe('disconnected');
    expect(component.metrics()).toEqual(OFFLINE_DASHBOARD.metrics);

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
