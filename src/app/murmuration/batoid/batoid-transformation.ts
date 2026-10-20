import { Random } from './batoid-types';

/** given some mapping function that produces a random number derived from an injection token we produce a random response from an equally distributed region of a given radius length about 0*/
export function spread(random: Random, radius: number): number {
  return (random() * 2 - 1) * radius;
}
