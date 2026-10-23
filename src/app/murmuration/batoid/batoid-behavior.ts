/** the central processes of a batoid e.g. separation, alignment, and cohesion are stored here.
 *  each returns an unweighted steer; how much of each a bat obeys is decided where they are summed */

import { IFlight, IThreeTuple } from '../cauldron/cauldron-flight';
import { INeighbourhood, wrappedOffset } from './batoid-awareness';

/** given some set of bats indicated by the awareness radius, we find the decomposed velocity vector that points away from them.
 *  each neighbour pushes along the line from it to self with a strength of 1/distance, so the nearest bat dominates;
 *  a bat sitting exactly on top of self has no direction to push in and is skipped */
export function separation(
  flight: IFlight,
  self: number,
  neighbourhood: INeighbourhood,
  radii: IThreeTuple
): IThreeTuple {
  const { positions } = flight;
  const a = self * 3;
  const steer: IThreeTuple = { x: 0, y: 0, z: 0 };
  for (const j of neighbourhood.separation) {
    const b = j * 3;
    // from the neighbour to self, the short way through the wrapping box
    const x = wrappedOffset(positions[b], positions[a], radii.x);
    const y = wrappedOffset(positions[b + 1], positions[a + 1], radii.y);
    const z = wrappedOffset(positions[b + 2], positions[a + 2], radii.z);
    const distance = x * x + y * y + z * z;
    if (distance === 0) {
      continue;
    }
    // offset / d² is the unit direction scaled by 1/d
    steer.x += x / distance;
    steer.y += y / distance;
    steer.z += z / distance;
  }
  return steer;
}

/** the difference between the mean velocity of the bats in the alignment sphere and self's own,
 *  so a bat already flying with its neighbours is asked to change nothing; alone, it is asked nothing either */
export function alignment(
  flight: IFlight,
  self: number,
  neighbourhood: INeighbourhood
): IThreeTuple {
  const { velocities } = flight;
  const seen = neighbourhood.alignment;
  if (seen.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const j of seen) {
    const b = j * 3;
    x += velocities[b];
    y += velocities[b + 1];
    z += velocities[b + 2];
  }
  const a = self * 3;
  return {
    x: x / seen.length - velocities[a],
    y: y / seen.length - velocities[a + 1],
    z: z / seen.length - velocities[a + 2],
  };
}

/** the offset from self to the centre of the bats in the cohesion sphere.
 *  the centre is averaged from wrapped offsets rather than raw positions, since two bats either side of a face
 *  would otherwise average to the middle of the box, as far from both as it is possible to be */
export function cohesion(
  flight: IFlight,
  self: number,
  neighbourhood: INeighbourhood,
  radii: IThreeTuple
): IThreeTuple {
  const { positions } = flight;
  const seen = neighbourhood.cohesion;
  if (seen.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const a = self * 3;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const j of seen) {
    const b = j * 3;
    x += wrappedOffset(positions[a], positions[b], radii.x);
    y += wrappedOffset(positions[a + 1], positions[b + 1], radii.y);
    z += wrappedOffset(positions[a + 2], positions[b + 2], radii.z);
  }
  return { x: x / seen.length, y: y / seen.length, z: z / seen.length };
}
