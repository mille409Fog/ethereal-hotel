import { TestBed } from '@angular/core/testing';
import { Elsewhere } from './elsewhere';

/**
 * The block as markup. `e2e/aubade.spec.ts` proves the still is really served
 * and that `/` creates no context; this proves the block asks for both doors
 * and a sized, lazy, described picture, and stays out of the nav's reach.
 */
describe('Elsewhere', () => {
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Elsewhere] }).compileComponents();
    const fixture = TestBed.createComponent(Elsewhere);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  it('links to the lobby and to the Reader’s Edition', () => {
    const hrefs = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/aubade', '/aubade/reader']);
  });

  it('shows a committed still, sized, lazy and described', () => {
    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toMatch(/^\/stills\/aubade-[a-z]+-[a-z]+\.webp$/);
    expect(img?.getAttribute('width')).toBe('1280');
    expect(img?.getAttribute('height')).toBe('720');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('alt')).not.toMatch(/screenshot|image of|picture of/i);
  });

  it('is not a section the nav could point at', () => {
    expect(el.querySelector('section, [id]')).toBeNull();
  });
});
