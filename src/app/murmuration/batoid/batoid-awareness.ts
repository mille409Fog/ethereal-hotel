import { IFlight } from '../cauldron/cauldron-flight';

/** the radius of each sphere a bat attends to; the three behaviours decide what is done with each */
export interface IAwareness {
  separation: number;
  alignment: number;
  cohesion: number;
}

/** the indices of the other bats inside each sphere, in flight order; a bat is never its own neighbour */
export interface INeighbourhood {
  separation: number[];
  alignment: number[];
  cohesion: number[];
}

export function emptyNeighbourhood(): INeighbourhood {
  return { separation: [], alignment: [], cohesion: [] };
}

/** squared distance between bat i and bat j, squared so no comparison pays for a root */
export function distanceSquared(positions: Float32Array, i: number, j: number): number {
  const a = i * 3;
  const b = j * 3;
  const x = positions[b] - positions[a];
  const y = positions[b + 1] - positions[a + 1];
  const z = positions[b + 2] - positions[a + 2];
  return x * x + y * y + z * z;
}

/** the indices of every other bat within radius of bat self, edge inclusive */
export function neighboursWithin(
  flight: IFlight,
  self: number,
  radius: number,
  into: number[] = []
): number[] {
  into.length = 0;
  const limit = radius * radius;
  const quantity = flight.positions.length / 3;
  for (let j = 0; j < quantity; j++) {
    if (j !== self && distanceSquared(flight.positions, self, j) <= limit) {
      into.push(j);
    }
  }
  return into;
}

/** what bat self can see of the flock: one distance per other bat, sorted into all three spheres at once.
 *  this is every pair, so n² per tick across the flock; fine at CAULDRON.count, a spatial grid replaces it if that grows.
 *  pass the previous tick's neighbourhood as into and its arrays are emptied and reused rather than reallocated */
export function perceive(
  flight: IFlight,
  self: number,
  awareness: IAwareness,
  into: INeighbourhood = emptyNeighbourhood()
): INeighbourhood {
  into.separation.length = 0;
  into.alignment.length = 0;
  into.cohesion.length = 0;
  const separation = awareness.separation ** 2;
  const alignment = awareness.alignment ** 2;
  const cohesion = awareness.cohesion ** 2;
  const quantity = flight.positions.length / 3;
  for (let j = 0; j < quantity; j++) {
    if (j === self) {
      continue;
    }
    const distance = distanceSquared(flight.positions, self, j);
    if (distance <= separation) {
      into.separation.push(j);
    }
    if (distance <= alignment) {
      into.alignment.push(j);
    }
    if (distance <= cohesion) {
      into.cohesion.push(j);
    }
  }
  return into;
}
