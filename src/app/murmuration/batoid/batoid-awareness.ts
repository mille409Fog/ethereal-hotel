import { IFlight, IThreeTuple } from '../cauldron/cauldron-flight';

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

/** the shortest signed distance from a to b along one axis of a box that wraps at ±radius,
 *  since flightStep carries a bat off one face and onto the opposite one, two bats either side of a face are close */
export function wrappedOffset(a: number, b: number, radius: number): number {
  let offset = b - a;
  if (offset > radius) {
    offset -= 2 * radius;
  } else if (offset < -radius) {
    offset += 2 * radius;
  }
  return offset;
}

/** squared distance between bat i and bat j through the wrapping box, squared so no comparison pays for a root */
export function distanceSquared(
  positions: Float32Array,
  i: number,
  j: number,
  radii: IThreeTuple
): number {
  const a = i * 3;
  const b = j * 3;
  const x = wrappedOffset(positions[a], positions[b], radii.x);
  const y = wrappedOffset(positions[a + 1], positions[b + 1], radii.y);
  const z = wrappedOffset(positions[a + 2], positions[b + 2], radii.z);
  return x * x + y * y + z * z;
}

/** the indices of every other bat within radius of bat self, edge inclusive */
export function neighboursWithin(
  flight: IFlight,
  self: number,
  radius: number,
  radii: IThreeTuple,
  into: number[] = []
): number[] {
  into.length = 0;
  const limit = radius * radius;
  const quantity = flight.positions.length / 3;
  for (let j = 0; j < quantity; j++) {
    if (j !== self && distanceSquared(flight.positions, self, j, radii) <= limit) {
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
  radii: IThreeTuple,
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
    const distance = distanceSquared(flight.positions, self, j, radii);
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
