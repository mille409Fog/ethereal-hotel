/**
 * Whether the visitor has asked their OS to minimise animation.
 *
 * This is a deliberate copy of `src/app/services/reduced-motion.ts`, not an
 * oversight. AUBADE is specified as a separate work sharing a deployment and
 * nothing else: nothing in `src/aubade/` imports from `src/app/`, and nothing
 * there imports from here. A shared one-line helper is exactly how that
 * separation erodes — first a function, then a token, then a stylesheet, and the
 * second work has quietly become a subsection of the first. Twelve duplicated
 * lines is the cheaper of the two mistakes available here.
 *
 * The optional call guards a jsdom quirk: `matchMedia` is not implemented there,
 * and a component test should not have to stub a global to mount a canvas.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
