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
});
