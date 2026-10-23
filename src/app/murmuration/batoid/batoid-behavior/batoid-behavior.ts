/** the central processes of a batoid e.g. separation, alignment, and cohesion are stored here, with homing, the
 *  fourth steer that keeps the flock over the cauldron now that nothing wraps it round.
 *  each returns an unweighted steer; how much of each a bat obeys is decided where they are summed */

import { IFlight, IThreeTuple } from '../../cauldron/cauldron-flight';
import {
  createNearest,
  emptyNeighbourhood,
  IAwareness,
  INearest,
  INeighbourhood,
  perceiveNearby,
} from '../batoid-awareness/batoid-awareness';
import { FLIGHT_SPEED, GRID_CELL_SIZE, MAX_PITCH } from '../batoid-calibration';
import { createGrid, fillGrid, ISpatialGrid } from '../batoid-grid/batoid-grid';
import { writeThreeTuple } from '../batoid-transformation/batoid-transformation';

/** how much of each steer a bat obeys when the four are summed */
export interface IBehaviourWeights {
  separation: number;
  alignment: number;
  cohesion: number;
  homing: number;
}

/** what a tick of steering writes into besides the flight, so the animation loop allocates no arrays per tick */
export interface ISteeringScratch {
  neighbourhood: INeighbourhood;
  nearest: INearest;
  grid: ISpatialGrid;
  velocities: Float32Array;
}

export function createSteeringScratch(
  quantity: number,
  cellSize: number = GRID_CELL_SIZE
): ISteeringScratch {
  return {
    neighbourhood: emptyNeighbourhood(),
    nearest: createNearest(0),
    grid: createGrid(quantity, cellSize),
    velocities: new Float32Array(quantity * 3),
  };
}

/** given some set of bats indicated by the awareness radius, we find the decomposed velocity vector that points away from them.
 *  each neighbour pushes along the line from it to self with a strength of 1/distance, so the nearest bat dominates;
 *  a bat sitting exactly on top of self has no direction to push in and is skipped */
export function separation(
  flight: IFlight,
  self: number,
  neighbourhood: INeighbourhood
): IThreeTuple {
  const { positions } = flight;
  const a = self * 3;
  const steer: IThreeTuple = { x: 0, y: 0, z: 0 };
  for (const j of neighbourhood.separation) {
    const b = j * 3;
    // from the neighbour to self
    const x = positions[a] - positions[b];
    const y = positions[a + 1] - positions[b + 1];
    const z = positions[a + 2] - positions[b + 2];
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

/** the offset from self to the centre of the bats in the cohesion sphere */
export function cohesion(
  flight: IFlight,
  self: number,
  neighbourhood: INeighbourhood
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
    x += positions[b] - positions[a];
    y += positions[b + 1] - positions[a + 1];
    z += positions[b + 2] - positions[a + 2];
  }
  return { x: x / seen.length, y: y / seen.length, z: z / seen.length };
}

/** the steer back toward the centre of the cauldron. the bat's position is measured in units of bounds, so the
 *  cauldron becomes an ellipsoid of radius 1, and the steer points back along that measure scaled by its square:
 *  barely there in the middle, so the flock is free to bulge and fold, one at the ellipsoid's surface, and eight
 *  at twice its radius, so no bat strays far. it is a pull rather than a wall, and a bat can overshoot it */
export function homing(flight: IFlight, self: number, bounds: IThreeTuple): IThreeTuple {
  const a = self * 3;
  const x = flight.positions[a] / bounds.x;
  const y = flight.positions[a + 1] / bounds.y;
  const z = flight.positions[a + 2] / bounds.z;
  const reach = x * x + y * y + z * z;
  return { x: -x * reach, y: -y * reach, z: -z * reach };
}

/** a steered velocity put back at FLIGHT_SPEED with its pitch held inside MAX_PITCH, the two things launch promises of every bat,
 *  so the three behaviours can only turn a bat and never speed it up, stop it or stand it on its tail.
 *  a steer with no horizontal part has no heading to keep, so the bat carries on as it was */
export function cruise(steered: IThreeTuple, previous: IThreeTuple): IThreeTuple {
  const horizontal = Math.hypot(steered.x, steered.z);
  if (horizontal === 0) {
    return { ...previous };
  }
  const climb = FLIGHT_SPEED * Math.sin(MAX_PITCH);
  const speed = Math.hypot(horizontal, steered.y);
  const y = Math.min(Math.max((steered.y / speed) * FLIGHT_SPEED, -climb), climb);
  const remainder = Math.sqrt(FLIGHT_SPEED ** 2 - y ** 2);
  return { x: (steered.x / horizontal) * remainder, y, z: (steered.z / horizontal) * remainder };
}

/** the steer of a behaviour that was not consulted this tick */
const UNHEARD: Readonly<IThreeTuple> = { x: 0, y: 0, z: 0 };

/** one tick of the four behaviours across the flight, summed by weight and applied as an acceleration over seconds.
 *  separation takes absolute priority over its neighbours, after Couzin et al. (2002): a bat with anyone inside its
 *  separation sphere steers by separation alone that tick, and only an uncrowded bat listens to alignment and cohesion.
 *  so the radii decide when each behaviour speaks, and the weights only how loudly.
 *  homing is outside that rule and always heard, or a crowd at the edge of the cauldron could push itself out of it.
 *  every bat reads the flight as it stood at the start of the tick, so the new velocities are gathered in scratch
 *  and written back together; steering bat 0 first must not change what bat 1 sees */
export function steerFlight(
  flight: IFlight,
  seconds: number,
  awareness: IAwareness,
  weights: IBehaviourWeights,
  bounds: IThreeTuple,
  scratch: ISteeringScratch = createSteeringScratch(flight.positions.length / 3)
): void {
  const { velocities } = flight;
  const { neighbourhood, nearest, grid } = scratch;
  const quantity = flight.positions.length / 3;
  fillGrid(grid, flight.positions);
  for (let i = 0; i < quantity; i++) {
    perceiveNearby(grid, flight, i, awareness, neighbourhood, nearest);
    const crowded = neighbourhood.separation.length > 0;
    const apart = crowded ? separation(flight, i, neighbourhood) : UNHEARD;
    const along = crowded ? UNHEARD : alignment(flight, i, neighbourhood);
    const toward = crowded ? UNHEARD : cohesion(flight, i, neighbourhood);
    const home = homing(flight, i, bounds);
    const o = i * 3;
    const previous = { x: velocities[o], y: velocities[o + 1], z: velocities[o + 2] };
    const steer = (axis: keyof IThreeTuple): number =>
      previous[axis] +
      (weights.separation * apart[axis] +
        weights.alignment * along[axis] +
        weights.cohesion * toward[axis] +
        weights.homing * home[axis]) *
        seconds;
    const steered = { x: steer('x'), y: steer('y'), z: steer('z') };
    writeThreeTuple(scratch.velocities, o, cruise(steered, previous));
  }
  velocities.set(scratch.velocities.subarray(0, quantity * 3));
}
