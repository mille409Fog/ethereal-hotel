import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Work } from './work';
import { CASE_STUDIES } from './work.data';

/**
 * `work.data.spec.ts` proves the studies are safe to publish. This one proves
 * they reach the DOM with their structure intact — that the five parts render
 * as headings under an `article` a screen reader can name, rather than as one
 * undifferentiated wall of text.
 */
describe('Work', () => {
  let fixture: ComponentFixture<Work>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Work] }).compileComponents();
    fixture = TestBed.createComponent(Work);
    await fixture.whenStable();
  });

  it('renders a main landmark, since it is the whole route', () => {
    expect(el().querySelector('main')).toBeTruthy();
    expect(el().querySelector('h1')?.textContent).toContain('Case Studies');
  });

  it('renders one article per study, each named by its heading', () => {
    const articles = el().querySelectorAll('article');
    expect(articles.length).toBe(CASE_STUDIES.length);

    for (const article of Array.from(articles)) {
      // The aria-labelledby target must resolve, or the article is unnamed and
      // the rotor lists three identical "article" entries.
      const labelledBy = article.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      const heading = el().querySelector(`#${labelledBy}`);
      expect(heading, `aria-labelledby="${labelledBy}" resolves to nothing`).toBeTruthy();
      expect(heading?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('says so plainly when no studies are written', () => {
    if (CASE_STUDIES.length > 0) {
      expect(el().querySelector('.work-empty')).toBeNull();
      return;
    }
    expect(el().querySelector('.work-empty')).toBeTruthy();
    expect(text()).toContain('Not written yet');
  });

  it('shows the cost of every decision it renders', () => {
    const costs = el().querySelectorAll('.study-cost');
    expect(costs.length).toBe(CASE_STUDIES.length);
    for (const cost of Array.from(costs)) {
      expect(cost.textContent).toContain('What it cost');
    }
  });
});
