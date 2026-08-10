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
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: readonly number[] = [];

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;
