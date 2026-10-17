import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Aesthetic } from './aesthetic';
import { CELLS, cellIndex, HUE_COUNT, TONES } from './wheel';
import { aestheticFor, FIGURE_WEIGHT, TEXT_CONTRAST } from './winnow';

/**
 * The route as a visitor meets it: a radio group of every cell with one tab
 * stop, a click or an arrow key chooses the primary, and the cards say what
 * is chosen and, truthfully, what is not.
 */
describe('Aesthetic', () => {
  let fixture: ComponentFixture<Aesthetic>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const cells = (): SVGPathElement[] => Array.from(el().querySelectorAll('path.cell'));
  const cell = (index: number): SVGPathElement =>
    el().querySelector(`[data-cell="${index}"]`) as SVGPathElement;
  const checked = (): Element[] => cells().filter((c) => c.getAttribute('aria-checked') === 'true');

  async function key(target: Element, name: string): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await fixture.whenStable();
    return event;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Aesthetic] }).compileComponents();
    fixture = TestBed.createComponent(Aesthetic);
    await fixture.whenStable();
  });

  it('renders a main landmark and every cell as a named radio', () => {
    expect(el().querySelector('main')).toBeTruthy();
    expect(el().querySelector('h1')?.textContent).toContain('The Aesthetic Generator');
    expect(el().querySelector('[role="radiogroup"]')).toBeTruthy();
    expect(cells().length).toBe(HUE_COUNT * TONES.length);
    expect(cell(0).getAttribute('role')).toBe('radio');
    expect(cell(0).getAttribute('aria-label')).toBe(`${CELLS[0].name}, hue 3°`);
    expect(cell(0).getAttribute('fill')).toBe(CELLS[0].hex);
  });

  it('starts with nothing chosen and exactly one tab stop', () => {
    expect(checked()).toEqual([]);
    expect(cells().filter((c) => c.getAttribute('tabindex') === '0').length).toBe(1);
    expect(el().querySelector('.marker')).toBeNull();
    expect(el().querySelector('.wheel-caption')?.textContent).toContain('Nothing chosen yet');
  });

  it('waits for a primary before showing an aesthetic', () => {
    const text = el().querySelector('.triad')?.textContent ?? '';
    expect(text).toContain('Choose a cell on the wheel.');
    expect(text.match(/Chosen from the primary\./g)?.length).toBe(2);
    expect(el().querySelector('.specimen')).toBeNull();
  });

  it('chooses a primary on click and shows it everywhere it appears', async () => {
    const target = CELLS[cellIndex(12, 3)];
    cell(target.index).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    expect(checked()).toEqual([cell(target.index)]);
    expect(cell(target.index).getAttribute('tabindex')).toBe('0');
    expect(el().querySelectorAll('.marker').length).toBe(3);
    expect(el().querySelector('.marker-primary')?.getAttribute('style')).toContain(
      `rotate(${target.h}deg)`
    );
    expect(el().querySelector('.triad-primary .triad-name')?.textContent).toContain(target.name);
    expect(el().querySelector('.triad-primary')?.textContent).toContain(target.hex);
    expect(el().querySelector('.wheel-caption')?.textContent).toContain(target.name);
    expect(el().querySelector('.wheel')?.classList).toContain('chosen');
  });

  it('walks the wheel with arrow keys, choosing as it goes, and moves focus', async () => {
    const start = cells().find((c) => c.getAttribute('tabindex') === '0') as SVGPathElement;
    start.focus();
    await fixture.whenStable();

    const event = await key(start, 'ArrowRight');
    const next = CELLS[Number(start.getAttribute('data-cell')) + 1];
    expect(event.defaultPrevented).toBe(true);
    expect(checked()).toEqual([cell(next.index)]);
    expect(document.activeElement).toBe(cell(next.index));

    await key(cell(next.index), 'ArrowUp');
    expect(checked()).toEqual([cell(next.index + HUE_COUNT)]);
  });

  it('chooses the focused cell on Enter and ignores keys it does not use', async () => {
    const event = await key(cell(5), 'a');
    expect(event.defaultPrevented).toBe(false);
    expect(checked()).toEqual([]);

    await key(cell(5), 'Enter');
    expect(checked()).toEqual([cell(5)]);
  });

  it('turns a marker the short way across twelve o’clock', async () => {
    const component = fixture.componentInstance;
    component.choosePrimary(CELLS[cellIndex(HUE_COUNT - 1, 2)]); // 357°
    await fixture.whenStable();
    component.choosePrimary(CELLS[cellIndex(0, 2)]); // 3°
    await fixture.whenStable();
    expect(el().querySelector('.marker-primary')?.getAttribute('style')).toContain(
      'rotate(363deg)'
    );
  });

  it('builds the aesthetic around the primary and shows all three roles', async () => {
    const primary = CELLS[cellIndex(0, 2)];
    const expected = aestheticFor(primary);
    fixture.componentInstance.choosePrimary(primary);
    await fixture.whenStable();

    expect(el().querySelector('.marker-secondary')).toBeTruthy();
    expect(el().querySelector('.marker-tertiary')).toBeTruthy();
    expect(el().querySelector('polygon.figure')?.getAttribute('points')?.split(' ').length).toBe(3);
    expect(el().querySelector('.triad-secondary .triad-name')?.textContent).toContain(
      expected.secondary.name
    );
    expect(el().querySelector('.triad-tertiary .triad-name')?.textContent).toContain(
      expected.tertiary.name
    );
  });

  it('shows a specimen whose type is set in the pair that passed the text filter', async () => {
    const expected = aestheticFor(CELLS[cellIndex(30, 1)]);
    fixture.componentInstance.choosePrimary(expected.primary);
    await fixture.whenStable();

    const type = el().querySelector<HTMLElement>('.specimen-type');
    expect(type?.style.color).toBeTruthy();
    const facts = el().querySelector('.specimen-facts')?.textContent ?? '';
    expect(facts).toContain(`${expected.text.ratio.toFixed(1)}:1`);
    expect(facts).toContain(expected.harmony.toFixed(2));
    expect(facts).toContain(expected.text.ink.name);
  });

  it('states the method with the numbers the code uses', () => {
    const text = el().querySelector('[aria-labelledby="winnow-heading"]')?.textContent ?? '';
    expect(text).toContain('128,522');
    expect(text).toContain(`${TEXT_CONTRAST}:1`);
    expect(text).toContain('60/30/10');
    expect(text).toContain(String(FIGURE_WEIGHT));
  });

  it('lights the hovered cell and previews it in the caption', async () => {
    cell(40).dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    await fixture.whenStable();
    expect(el().querySelector('.lit')).toBeTruthy();
    expect(el().querySelector('.wheel-caption')?.textContent).toContain('Under the cursor');

    el().querySelector('.cells')?.dispatchEvent(new MouseEvent('pointerleave'));
    await fixture.whenStable();
    expect(el().querySelector('.lit')).toBeNull();
  });

  it('ignores a click it cannot place, as on an unlaid-out continuum', async () => {
    // jsdom lays nothing out, so the position fallback has no size to work from.
    el()
      .querySelector('.continuum-hit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    expect(checked()).toEqual([]);
  });

  it('rings keyboard focus, not the focus a click leaves behind', async () => {
    // A focus with no key behind it, as a click gives: the tab stop moves, no ring.
    cell(7).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await fixture.whenStable();
    expect(cell(7).getAttribute('tabindex')).toBe('0');
    expect(el().querySelector('.lit-focus')).toBeNull();

    await key(cell(7), 'ArrowRight');
    expect(el().querySelector('.lit-focus')).toBeTruthy();

    cell(8).dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await fixture.whenStable();
    expect(el().querySelector('.lit')).toBeNull();
  });

  it('previews nothing under a finger, which has no hover', async () => {
    const touch = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    cell(40).dispatchEvent(touch);
    await fixture.whenStable();
    expect(el().querySelector('.lit')).toBeNull();
  });
});
