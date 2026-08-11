import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardHeader } from './dashboard-header';
import { BackendStatus } from '../../services/dashboard-api.service';

/**
 * The header carries the provenance notice. The hosted demo runs on a committed
 * fixture until the API is deployed, so the one thing these tests guard is that
 * it never claims "live" unless the backend is actually connected.
 */
describe('DashboardHeader', () => {
  let fixture: ComponentFixture<DashboardHeader>;

  const renderWithStatus = async (status: BackendStatus): Promise<string> => {
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    return fixture.nativeElement.textContent as string;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardHeader],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardHeader);
  });

  it('starts in the checking state before a status arrives', async () => {
    await fixture.whenStable();

    expect(fixture.componentInstance.status()).toBe('checking');
    expect(fixture.nativeElement.textContent).toContain('Connecting to the API');
  });

  it('announces live data once the backend is connected', async () => {
    const text = await renderWithStatus('connected');

    expect(text).toContain('Live data');
    expect(text).not.toContain('Simulated data');
    expect(fixture.nativeElement.querySelector('.data-source--live')).toBeTruthy();
  });

  it('says plainly that the numbers are simulated when the backend is unreachable', async () => {
    const text = await renderWithStatus('disconnected');

    expect(text).toContain('Simulated data');
    expect(text).not.toContain('Live data');
    expect(fixture.nativeElement.querySelector('.data-source--simulated')).toBeTruthy();
  });

  /**
   * The visual badge distinguishes live from simulated with a colour and a `·`,
   * neither of which survives being read aloud. These guard the spoken copy.
   */
  describe('screen reader announcement', () => {
    /** The live region, which is what a screen reader actually reads out. */
    const liveRegion = (): HTMLElement | null =>
      fixture.nativeElement.querySelector('[role="status"]');

    it('is exposed as a polite live region', async () => {
      await fixture.whenStable();

      expect(liveRegion()).toBeTruthy();
    });

    it('names the backend as unreachable and the figures as simulated', async () => {
      await renderWithStatus('disconnected');

      const announcement = liveRegion()?.textContent ?? '';
      expect(announcement).toContain('unreachable');
      expect(announcement).toContain('simulated');
    });

    it('confirms live updates once connected', async () => {
      await renderWithStatus('connected');

      expect(liveRegion()?.textContent).toContain('updating live');
    });

    /**
     * The badge and the live region say the same thing two different ways. If
     * the badge were left exposed, a screen reader would read both in sequence.
     */
    it('hides the visual badge from assistive technology to avoid a duplicate', async () => {
      await renderWithStatus('connected');

      const badge = fixture.nativeElement.querySelector('.data-source');
      expect(badge?.closest('[aria-hidden="true"]')).toBeTruthy();
    });
  });
});
