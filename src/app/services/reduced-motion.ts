/**
 * Whether the user has asked their OS to minimise animation.
 *
 * CSS handles most of this on its own (see the `prefers-reduced-motion` block
 * in `styles.css`), but two effects here are driven from TypeScript and cannot
 * be switched off from a stylesheet: the hero's parallax offset, which is
 * written as an inline transform, and the scroll-reveal directive, which starts
 * elements at `opacity: 0`. Both consult this.
 *
 * Read on demand rather than cached at startup: a user can flip the setting
 * mid-session, and this is cheap enough that memoising it would trade
 * correctness for nothing.
 *
 * The optional call guards a jsdom quirk — `matchMedia` is not implemented in
 * every version, and a unit test that renders the hero should not depend on it.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
