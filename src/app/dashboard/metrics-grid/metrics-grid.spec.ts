import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MetricsGrid } from './metrics-grid';
import { IMetrics } from '../../services/dashboard-api.service';
import { OFFLINE_DASHBOARD } from '../../services/offline-dashboard.fixture';

/**
 * The grid is presentational, but it does two pieces of arithmetic the rest of
 * the dashboard depends on being right: how much inventory is out of service,
 * and which way the house is moving today.
 */

/** The committed fixture with a few fields moved, so each case reads clearly. */
const metricsWith = (overrides: Partial<IMetrics>): IMetrics => ({
  ...OFFLINE_DASHBOARD.metrics,
  ...overrides,
});

describe('MetricsGrid', () => {
  let fixture: ComponentFixture<MetricsGrid>;

  /** Applies `metrics`, lets the view settle, and hands back the rendered text. */
  const render = async (metrics: IMetrics): Promise<string> => {
    fixture.componentRef.setInput('metrics', metrics);
    await fixture.whenStable();
    return fixture.nativeElement.textContent as string;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MetricsGrid],
    }).compileComponents();

    fixture = TestBed.createComponent(MetricsGrid);
  });

  it('falls back to the committed fixture when no metrics are supplied', async () => {
    await fixture.whenStable();

    expect(fixture.componentInstance.metrics()).toEqual(OFFLINE_DASHBOARD.metrics);
    expect(fixture.nativeElement.textContent).toContain('Occupancy');
  });

  describe('outOfServiceRooms', () => {
    it('counts the rooms held back from the sellable inventory', async () => {
      const text = await render(metricsWith({ totalRooms: 40, operationalRooms: 36 }));

      expect(fixture.componentInstance.outOfServiceRooms()).toBe(4);
      expect(text).toContain('4 out of service');
    });

    it('clamps at zero when every room is sellable', async () => {
      await render(metricsWith({ totalRooms: 40, operationalRooms: 40 }));

      expect(fixture.componentInstance.outOfServiceRooms()).toBe(0);
    });

    // Guards against a bad backend read showing a negative room count on screen.
    it('clamps at zero when operational somehow exceeds total', async () => {
      await render(metricsWith({ totalRooms: 30, operationalRooms: 34 }));

      expect(fixture.componentInstance.outOfServiceRooms()).toBe(0);
    });
  });

  describe('netRoomsMovement', () => {
    it('reads a filling house as a positive net', async () => {
      const text = await render(metricsWith({ arrivalsToday: 9, departuresToday: 4 }));

      expect(fixture.componentInstance.netRoomsMovement()).toBe(5);
      expect(text).toContain('Net +5 rooms filling today');
    });

    it('reads an emptying house as a negative net', async () => {
      const text = await render(metricsWith({ arrivalsToday: 3, departuresToday: 8 }));

      expect(fixture.componentInstance.netRoomsMovement()).toBe(-5);
      expect(text).toContain('Net -5 rooms emptying today');
    });

    it('reads a matched day as even turnover', async () => {
      const text = await render(metricsWith({ arrivalsToday: 6, departuresToday: 6 }));

      expect(fixture.componentInstance.netRoomsMovement()).toBe(0);
      expect(text).toContain('Even turnover today');
    });
  });
});
