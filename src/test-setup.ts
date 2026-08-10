/**
 * Global test setup, loaded before any spec runs (see `setupFiles` in
 * angular.json).
 *
 * jsdom does not implement `IntersectionObserver`, which the
 * `appScrollReveal` directive instantiates in `ngOnInit`. Any component test
 * that renders a template using the directive would otherwise throw
 * `ReferenceError: IntersectionObserver is not defined`. A minimal no-op stub
 * keeps those components mountable under test.
 */
class MockIntersectionObserver {
  public readonly root: Element | Document | null = null;
  public readonly rootMargin: string = '';
  public readonly thresholds: readonly number[] = [];

  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;
