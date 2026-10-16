import { IColour, IPainting } from './gallery.data';

/**
 * How `/gallery` chooses, in full.
 *
 * There is no model here and the page does not pretend otherwise. The
 * collection is partitioned by colour in `gallery.data.ts`, so the whole of the
 * "recommendation" is two uniform draws: which colours to offer, and which
 * painting in the chosen colour to hang. The page states exactly that under
 * the orbs, with the counts read from the data. A visitor who reads it and
 * comes here should find nothing it left out.
 *
 * Kept free of Angular so the rules can be tested without a component, and
 * with the randomness passed in so the tests can choose what "random" says.
 */

/** A source of numbers in [0, 1), the contract `Math.random` has. */
export type Random = () => number;

/** A uniform integer in [0, bound). */
function below(bound: number, random: Random): number {
  // The clamp guards a source that returns exactly 1, which `Math.random`
  // never does but a test double easily might.
  return Math.min(bound - 1, Math.floor(random() * bound));
}

/**
 * `count` distinct colours, uniformly at random, in random order.
 *
 * A partial Fisher–Yates shuffle: only the first `count` places are settled,
 * which is all the page shows. Asking for more colours than exist returns all
 * of them rather than throwing, because "show five" over a collection that has
 * shrunk to four should still render a page.
 */
export function offerColours(
  colours: readonly IColour[],
  count: number,
  random: Random
): readonly IColour[] {
  const pool = [...colours];
  const take = Math.min(count, pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + below(pool.length - i, random);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

/**
 * One painting from the colour's group, uniformly at random.
 *
 * `previous` is the painting already on the wall. It is excluded when the group
 * has anything else in it, so "another" always changes the picture; a group of
 * one returns its only painting rather than nothing.
 */
export function recommend(colour: IColour, random: Random, previous?: string): IPainting {
  const candidates =
    colour.paintings.length > 1
      ? colour.paintings.filter((painting) => painting.slug !== previous)
      : colour.paintings;
  if (candidates.length === 0) {
    throw new Error(`The ${colour.name} group has no paintings to recommend.`);
  }
  return candidates[below(candidates.length, random)];
}
