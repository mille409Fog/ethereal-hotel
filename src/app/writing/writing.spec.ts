import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Writing } from './writing';
import { MURMURATION_LOG, parseLog } from './writing.data';

/**
 * Three parts: the text format parses the way `writing.data.ts` says it does;
 * the committed log is well-formed under it, so an entry appended in a hurry
 * cannot carry an impossible date or land out of order; and it reaches the DOM
 * as one named section of dated, individually linkable articles.
 */
describe('parseLog', () => {
  it('starts an entry at each date line and splits paragraphs on blank lines', () => {
    const text =
      'Preamble.\r\n\r\n2026-01-02\n\nOne.\nstill one.\n\n  \nTwo.\n\n2026-01-03\n\nThree.\n';
    expect(parseLog(text)).toEqual([
      { date: null, paragraphs: ['Preamble.'] },
      { date: '2026-01-02', paragraphs: ['One.\nstill one.', 'Two.'] },
      { date: '2026-01-03', paragraphs: ['Three.'] },
    ]);
  });

  it('reads an empty file as an empty log', () => {
    expect(parseLog('')).toEqual([]);
    expect(parseLog('\n\n')).toEqual([]);
  });
});

describe('MURMURATION_LOG', () => {
  const dated = MURMURATION_LOG.flatMap((entry) => (entry.date ? [entry.date] : []));

  it('dates every entry with a date that exists', () => {
    for (const date of dated) {
      // Round-trips only if the date exists: 2026-02-30 parses, then reads back as March.
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
    }
  });

  it('keeps entries oldest first, one per date', () => {
    // Strictly increasing: the date is the entry's anchor, so two entries on
    // one day would share an id.
    for (let i = 1; i < dated.length; i++) {
      expect(dated[i] > dated[i - 1], `${dated[i]} after ${dated[i - 1]}`).toBe(true);
    }
  });
});

describe('Writing', () => {
  let fixture: ComponentFixture<Writing>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Writing] }).compileComponents();
    fixture = TestBed.createComponent(Writing);
    await fixture.whenStable();
  });

  it('renders a main landmark holding exactly one section, MURMURATION_LOG', () => {
    expect(el().querySelector('main')).toBeTruthy();
    const sections = el().querySelectorAll('section');
    expect(sections.length).toBe(1);
    expect(sections[0].querySelector('h2')?.textContent?.trim()).toBe('MURMURATION_LOG');
    expect(el().querySelectorAll('article').length).toBe(MURMURATION_LOG.length);
  });

  it('says so plainly when the log is empty', async () => {
    fixture.componentRef.setInput('entries', []);
    await fixture.whenStable();
    expect(el().querySelector('.log-empty')?.textContent).toContain('No entries yet');
    expect(el().querySelector('article')).toBeNull();
  });

  // The real log may be empty, so the entry markup is exercised with a sample
  // rather than left untested until the first entry lands.
  it('renders dated entries as linkable, named articles and undated text without either', async () => {
    fixture.componentRef.setInput('entries', parseLog('Before.\n\n2026-01-03\n\nOne.\n\nTwo.'));
    await fixture.whenStable();

    expect(el().querySelector('.log-empty')).toBeNull();
    const [undated, dated] = Array.from(el().querySelectorAll('article'));

    expect(undated.id).toBe('');
    expect(undated.hasAttribute('aria-labelledby')).toBe(false);
    expect(undated.querySelector('h3')).toBeNull();

    expect(dated.id).toBe('2026-01-03');
    const labelledBy = dated.getAttribute('aria-labelledby');
    expect(el().querySelector(`[id="${labelledBy}"]`)?.textContent?.trim()).toBe('2026-01-03');
    expect(dated.querySelector('time')?.getAttribute('datetime')).toBe('2026-01-03');
    expect(dated.querySelectorAll('p').length).toBe(2);
  });
});
