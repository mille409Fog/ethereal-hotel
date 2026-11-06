import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardFooter } from './dashboard-footer';
import { BackendStatus, POLL_INTERVAL_SECONDS } from '../../services/dashboard-api.service';

/**
 * The footer sits directly below the provenance badge and used to contradict it
 * with a hard-coded "Streamed over a WebSocket every 2 seconds" on a deployment
 * that polls. These tests hold its transport sentence to the badge's status.
 */
describe('DashboardFooter', () => {
  let fixture: ComponentFixture<DashboardFooter>;

  const renderWithStatus = async (status: BackendStatus): Promise<string> => {
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    const note: HTMLElement = fixture.nativeElement.querySelector('.dashboard-note');
    return (note.textContent ?? '').replace(/\s+/g, ' ').trim();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardFooter],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardFooter);
  });

  it('claims no transport until the status is known', async () => {
    await fixture.whenStable();

    const note: HTMLElement = fixture.nativeElement.querySelector('.dashboard-note');
    expect(fixture.componentInstance.status()).toBe('checking');
    expect(note.textContent?.trim()).toBe(
      'Occupancy, ADR and RevPAR computed from room, guest and booking records'
    );
  });

  it('names the socket when connected, without an interval the frontend cannot know', async () => {
    const text = await renderWithStatus('connected');

    expect(text).toContain('• Streamed over a WebSocket');
    expect(text).not.toMatch(/every|\d/);
  });

  it('states the interval the polling timer actually runs on', async () => {
    const text = await renderWithStatus('polling');

    expect(text).toContain(`• Polled over REST every ${POLL_INTERVAL_SECONDS} seconds`);
    expect(text).not.toContain('WebSocket');
  });

  it('says the figures have stopped updating when the backend is unreachable', async () => {
    const text = await renderWithStatus('disconnected');

    expect(text).toContain('• Committed snapshot, not updating');
    expect(text).not.toContain('WebSocket');
    expect(text).not.toContain('Polled');
  });
});
