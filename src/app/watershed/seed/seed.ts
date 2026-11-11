/**
 * a land is named by one 32-bit integer. everything that is chance in the piece is drawn from a generator started
 * at that integer, so the address `?seed=` carries is the whole of what a visitor needs to send someone a land.
 */

/** a function returning the next draw in [0, 1), the shape of `Math.random` */
export type Random = () => number;

/** one more than the largest seed: seeds are unsigned 32-bit integers */
export const SEED_SPAN = 2 ** 32;

/**
 * the land the still frame and the stored land are made from. provisional: the phase that tunes the look tries
 * several seeds and names the one whose golden-hour frame is the project card.
 */
export const HERO_SEED = 4127;

/** a seed holds at most ten decimal digits; anything else in the address is not a seed */
const SEED_PATTERN = /^\d{1,10}$/;

/**
 * mulberry32. small, fast, and its whole state is the one integer, which is why a seed can be an address.
 * `e2e/project-frames.spec.ts` pins chance with the same generator.
 */
export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / SEED_SPAN;
  };
}

/**
 * the seed a query string names, or null when it names none. strict on purpose: `?seed=12abc` reading as 12
 * would hand two different addresses the same land and neither sender would know.
 */
export function parseSeed(search: string): number | null {
  const stated = new URLSearchParams(search).get('seed');
  if (stated === null || !SEED_PATTERN.test(stated)) {
    return null;
  }
  const seed = Number(stated);
  return seed < SEED_SPAN ? seed : null;
}

/** a fresh seed from one draw of chance */
export function drawSeed(random: Random): number {
  return Math.floor(random() * SEED_SPAN) >>> 0;
}
