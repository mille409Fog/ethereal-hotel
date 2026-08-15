import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EDITION } from './edition';
import { AubadeReader } from './reader';

/**
 * `/aubade/reader` — the Reader's Edition, as a route.
 *
 * `edition.spec.ts` judges the writing and `standing.spec.ts` judges the
 * sentences the sun moves. What is left for this file is the part neither can
 * see: that the page a browser actually builds out of them is a page — every
 * section rendered, one `h1`, a landmark, a contents list whose links point at
 * targets that exist, and a way back.
 *
 * Two of these assertions are the phase's Definition of Done rather than
 * ordinary component hygiene, and they are worth naming.
 *
 * **No canvas, and no context.** "No WebGL context created on that route at
 * all." The e2e suite counts `getContext` calls against the real page, which is
 * the honest version of this claim; what is checkable here is that mounting the
 * component asks for nothing and renders no drawing surface.
 *
 * **Every in-page link is absolute.** `src/index.html` sets `<base href="/">`,
 * so a bare `#the-sun` resolves against the base rather than the current URL and
 * silently navigates to the home page. That has already happened once on the
 * lobby's cue link; it would happen seven times over on this page's contents
 * list, and every one of them would look like a working link.
 */

describe('the Reader’s Edition', () => {
  let fixture: ComponentFixture<AubadeReader>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => host().textContent ?? '';
  const all = <T extends Element>(selector: string): T[] => [
    ...host().querySelectorAll<T>(selector),
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AubadeReader] }).compileComponents();
    fixture = TestBed.createComponent(AubadeReader);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  describe('as a page', () => {
    it('owns a main landmark, because it is the whole route', () => {
      expect(host().querySelector('main')).not.toBeNull();
    });

    it('has exactly one first-level heading, and it is the hotel', () => {
      const headings = all<HTMLHeadingElement>('h1');

      expect(headings).toHaveLength(1);
      expect(headings[0].textContent).toContain('Aubade');
    });

    it('renders every section of the work, with its heading', () => {
      for (const section of EDITION) {
        expect(host().querySelector(`#${section.id}`)).not.toBeNull();
        expect(text()).toContain(section.heading);
      }
    });

    it('renders every paragraph, rather than the first of each', () => {
      const written = EDITION.flatMap((section) => [...section.paragraphs, ...section.coda]);

      for (const paragraph of written) {
        expect(text()).toContain(paragraph);
      }
    });

    it('lists the six floors as a description list', () => {
      // Six names and what is behind each of them, which is what a `dl` is for.
      expect(all('.reader__floors dt')).toHaveLength(6);
      expect(all('.reader__floors dd')).toHaveLength(6);
      expect(text()).toContain('The Mirror Corridor');
      expect(text()).toContain('The Box');
    });
  });

  describe('the keyboard path', () => {
    it('offers a contents list covering the standing and every section', () => {
      const links = all<HTMLAnchorElement>('.reader__contents a');

      expect(links).toHaveLength(EDITION.length + 1);
    });

    it('points every contents link at something that is actually on the page', () => {
      for (const link of all<HTMLAnchorElement>('.reader__contents a')) {
        const fragment = (link.getAttribute('href') ?? '').split('#')[1];

        expect(fragment).toBeTruthy();
        expect(host().querySelector(`#${fragment}`)).not.toBeNull();
      }
    });

    it('writes those links out in full, because a bare fragment leaves the route', () => {
      // `<base href="/">` resolves `#the-sun` against the base rather than the
      // current URL, so a fragment-only href navigates to the home page while
      // looking exactly like a working anchor.
      for (const link of all<HTMLAnchorElement>('.reader__contents a')) {
        expect(link.getAttribute('href')).toMatch(/^\/aubade\/reader#/);
      }
    });

    it('makes every jump target focusable, so a jump moves focus and not just scroll', () => {
      // A same-page link that only scrolls strands a keyboard user's focus at
      // the top of the page, so the next Tab resumes from the contents list.
      for (const link of all<HTMLAnchorElement>('.reader__contents a')) {
        const fragment = (link.getAttribute('href') ?? '').split('#')[1];

        expect(host().querySelector(`#${fragment}`)?.getAttribute('tabindex')).toBe('-1');
      }
    });

    it('offers a way back into the lobby', () => {
      const door = host().querySelector<HTMLAnchorElement>('.reader__door');

      expect(door).not.toBeNull();
      expect(door?.getAttribute('href')).toBe('/aubade');
    });
  });

  describe('what the sun is doing', () => {
    it('states it in words, which is the requirement', () => {
      const standing = host().querySelector('#standing');

      expect(standing?.textContent).toContain('Your browser reports the time zone');
      expect(standing?.textContent).toContain('degrees');
    });

    it('is the same three sentences the component computed', () => {
      const standing = host().querySelector('#standing')?.textContent ?? '';
      const computed = fixture.componentInstance.standing();

      expect(standing).toContain(computed.place);
      expect(standing).toContain(computed.sun);
      expect(standing).toContain(computed.next);
    });

    it('re-reads the sun on a timer, so the hotel can close under a reader', () => {
      // Twelve hundred words is five or six minutes, and the narrowest of the
      // five states is about half an hour. A page that stated astronomical
      // night at the top and was still saying so after sunrise would be making
      // exactly the claim this project exists not to make.
      //
      // Its own fixture, and fake timers installed before it: the interval is
      // created in a field initialiser, so a component mounted under real
      // timers is holding a handle no fake clock can advance.
      vi.useFakeTimers();
      const ticking = TestBed.createComponent(AubadeReader);
      ticking.detectChanges();
      const before = ticking.componentInstance.clock();

      vi.advanceTimersByTime(60_000);

      expect(ticking.componentInstance.clock()).not.toBe(before);
      ticking.destroy();
      vi.useRealTimers();
    });

    it('does not announce itself, because a reader is mid-sentence', () => {
      // It changes at most five times while somebody reads. Interrupting them
      // to say the sun has moved two degrees would be hostile.
      expect(host().querySelector('[aria-live]')).toBeNull();
    });
  });

  describe('no WebGL, at all', () => {
    it('renders no drawing surface', () => {
      expect(host().querySelector('canvas')).toBeNull();
    });

    it('asks no browser for a context', () => {
      // The phase's Definition of Done. Held by construction — nothing this
      // component imports reaches `gl/`, `rooms/` or `renderer.ts` — and gated
      // structurally by `check:docs`, because a runtime assertion cannot see an
      // import graph and an import graph cannot see a browser.
      const asked = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

      const second = TestBed.createComponent(AubadeReader);
      second.detectChanges();

      expect(asked).not.toHaveBeenCalled();
      second.destroy();
    });
  });

  describe('leaving the route', () => {
    it('stops re-reading the sun', () => {
      // A ticker that outlives its component is a leak that survives every
      // navigation for as long as the tab is open.
      const cleared = vi.spyOn(globalThis, 'clearInterval');

      fixture.destroy();

      expect(cleared).toHaveBeenCalled();
    });
  });
});
