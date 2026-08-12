import { TestBed } from '@angular/core/testing';
import { ANALYTICS_EVENTS, AnalyticsService } from './analytics.service';

/**
 * The service's whole job is to reach `window.va` without caring whether
 * Vercel's script has arrived. Both halves of that are worth pinning: the
 * buffering shim is what stops a bootstrap-time event being dropped, and the
 * delegation is what stops every event being buffered forever once the real
 * function exists.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    delete window.va;
    delete window.vaq;
    TestBed.configureTestingModule({});
    service = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    delete window.va;
    delete window.vaq;
  });

  describe('before the script has loaded', () => {
    it('buffers the event instead of throwing', () => {
      expect(() => service.track(ANALYTICS_EVENTS.dashboardReached)).not.toThrow();

      expect(window.vaq).toEqual([['event', { name: 'dashboard_reached', data: undefined }]]);
    });

    it('keeps every buffered event, in order', () => {
      service.track(ANALYTICS_EVENTS.dashboardReached);
      service.track(ANALYTICS_EVENTS.resumeDownloaded);

      expect(window.vaq?.map(([, payload]) => (payload as { name: string }).name)).toEqual([
        'dashboard_reached',
        'resume_downloaded',
      ]);
    });

    it('passes properties through to the queue', () => {
      service.track(ANALYTICS_EVENTS.caseStudyRead, { study: 'a-slug' });

      expect(window.vaq?.[0][1]).toEqual({ name: 'case_study_read', data: { study: 'a-slug' } });
    });
  });

  describe('once the script has loaded', () => {
    it('calls the real function rather than the queue', () => {
      const va = vi.fn();
      window.va = va;

      service.track(ANALYTICS_EVENTS.caseStudyRead, { study: 'a-slug' });

      expect(va).toHaveBeenCalledWith('event', {
        name: 'case_study_read',
        data: { study: 'a-slug' },
      });
      expect(window.vaq).toBeUndefined();
    });
  });

  /**
   * Not a style assertion. The names are the join key against Vercel's
   * dashboard and against `docs/analytics.md`; renaming one silently starts a
   * fresh series and makes the old one look like it stopped happening.
   */
  it('sends the three event names the docs promise', () => {
    expect(Object.values(ANALYTICS_EVENTS)).toEqual([
      'dashboard_reached',
      'case_study_read',
      'resume_downloaded',
    ]);
  });
});
