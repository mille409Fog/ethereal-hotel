import { prefersReducedMotion } from './reduced-motion';

/**
 * Small enough to read in one go, but it gates two visible behaviours — the
 * hero parallax and whether the scroll-reveal directive runs at all — so the
 * fallback path matters as much as the happy one.
 */
describe('prefersReducedMotion', () => {
  const stubMatchMedia = (matches: boolean): void => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches, media: query }),
    });
  };

  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('reports the preference when the media query matches', () => {
    stubMatchMedia(true);

    expect(prefersReducedMotion()).toBe(true);
  });

  it('reports no preference when the media query does not match', () => {
    stubMatchMedia(false);

    expect(prefersReducedMotion()).toBe(false);
  });

  /**
   * jsdom ships without `matchMedia`. Without the optional call this throws,
   * which would take out every unit test that renders the hero — a test-only
   * failure, but one that would have been blamed on the component.
   */
  it('falls back to allowing motion where matchMedia is unavailable', () => {
    expect(window.matchMedia).toBeUndefined();

    expect(prefersReducedMotion()).toBe(false);
  });
});
