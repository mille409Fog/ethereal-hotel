import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Gallery, GALLERY_RANDOM } from './gallery';
import { COLOURS, ORBS_SHOWN } from './gallery.data';

/**
 * The route as a visitor meets it. `recommend.spec.ts` proves the draws are
 * fair; this proves a press on an orb hangs that colour's painting, with its
 * label, and that focus follows it there.
 *
 * Chance is pinned to 0, which makes every draw the first candidate: the
 * offered colours are the first ORBS_SHOWN in data order, and a colour hangs
 * its first painting, or its second when the first is already up.
 */
describe('Gallery', () => {
  let fixture: ComponentFixture<Gallery>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const orbs = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button.orb'));
  const button = (name: RegExp): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find((b) => name.test(b.textContent ?? ''));
  const heading = (): string => el().querySelector('#painting-title')?.textContent?.trim() ?? '';

  async function press(target: HTMLButtonElement | undefined): Promise<void> {
    expect(target, 'button not rendered').toBeTruthy();
    target?.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gallery],
      providers: [{ provide: GALLERY_RANDOM, useValue: () => 0 }],
    }).compileComponents();
    fixture = TestBed.createComponent(Gallery);
    await fixture.whenStable();
  });

  it('renders a main landmark, since it is the whole route', () => {
    expect(el().querySelector('main')).toBeTruthy();
    expect(el().querySelector('h1')?.textContent).toContain('The Gallery');
  });

  it('offers ORBS_SHOWN colours by name and mood, none pressed, nothing hung', () => {
    expect(orbs().length).toBe(ORBS_SHOWN);
    for (const [index, orb] of orbs().entries()) {
      expect(orb.textContent).toContain(COLOURS[index].name);
      expect(orb.textContent).toContain(COLOURS[index].mood);
      expect(orb.getAttribute('aria-pressed')).toBe('false');
    }
    expect(el().querySelector('article')).toBeNull();
    expect(el().textContent).toContain('Nothing is hanging yet');
  });

  it("hangs a painting from the chosen colour's group, with its full label", async () => {
    const colour = COLOURS[1];
    const painting = colour.paintings[0];
    await press(orbs()[1]);

    expect(orbs()[1].getAttribute('aria-pressed')).toBe('true');
    expect(heading()).toBe(painting.title);

    const img = el().querySelector('article img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(`/gallery/${painting.image.file}`);
    expect(img.getAttribute('width')).toBe(String(painting.image.width));
    expect(img.getAttribute('height')).toBe(String(painting.image.height));
    expect(img.alt).toBe(painting.image.alt);

    const text = el().querySelector('article')?.textContent ?? '';
    for (const fact of [painting.artist, painting.museum, painting.medium, painting.size]) {
      expect(text).toContain(fact);
    }
    for (const label of ['From across the room', 'Up close', 'In its time']) {
      expect(text).toContain(label);
    }
    expect(el().querySelector(`article a[href="${painting.source}"]`)).toBeTruthy();
  });

  it("dresses the card in the chosen colour's palette and frame", async () => {
    const article = (): HTMLElement => el().querySelector('article') as HTMLElement;

    await press(orbs()[0]);
    expect(article().dataset['frame']).toBe(COLOURS[0].palette.frame);
    expect(article().style.getPropertyValue('--room-surface')).toBe(COLOURS[0].palette.surface);

    // A second colour re-dresses the same card rather than keeping the first.
    await press(orbs()[1]);
    expect(article().dataset['frame']).toBe(COLOURS[1].palette.frame);
    expect(article().style.getPropertyValue('--room-accent-text')).toBe(
      COLOURS[1].palette.accentText
    );
  });

  it('moves focus to the painting, which may be out of view below the orbs', async () => {
    await press(orbs()[0]);
    expect(document.activeElement?.id).toBe('painting-title');
  });

  it('hangs a different painting of the same colour on request', async () => {
    const colour = COLOURS[0];
    await press(orbs()[0]);
    expect(heading()).toBe(colour.paintings[0].title);

    await press(button(/Another .* painting/));
    expect(heading()).toBe(colour.paintings[1].title);
    expect(orbs()[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('treats a second press on the lit orb as a request for another', async () => {
    await press(orbs()[2]);
    await press(orbs()[2]);
    expect(heading()).toBe(COLOURS[2].paintings[1].title);
  });

  it('clears the wall when the colours are redrawn', async () => {
    await press(orbs()[0]);
    await press(button(/different colours/));
    expect(el().querySelector('article')).toBeNull();
    expect(orbs().every((orb) => orb.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('states how it chooses, with counts read from the collection', () => {
    const total = COLOURS.reduce((sum, colour) => sum + colour.paintings.length, 0);
    const method = el().querySelector('.gallery-method')?.textContent?.replace(/\s+/g, ' ');
    expect(method).toContain(`${total} paintings`);
    expect(method).toContain(`${COLOURS.length} colour groups`);
    expect(method).toContain(`offered ${ORBS_SHOWN} of the colours`);
  });
});
