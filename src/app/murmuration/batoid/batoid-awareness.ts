import { IFlight } from '../cauldron/cauldron-flight';
import { bucketOfCell, cellOf, ISpatialGrid } from './batoid-grid';

/** what a bat attends to. separation is metric, a radius, because it answers to a collision; alignment and cohesion are
 *  topological, a count of nearest neighbours, after Ballerini et al. (2008), who found starlings answer to about
 *  seven neighbours however far apart those happen to be. so a flock that stretches thin keeps hold of itself, and the
 *  cost of a bat's attention stays the same at any density */
export interface IAwareness {
  /** the radius inside which a neighbour is too close */
  separation: number;
  /** how many nearest neighbours a bat matches its velocity to; a whole number */
  alignment: number;
  /** how many nearest neighbours a bat closes on; a whole number */
  cohesion: number;
}

/** the indices of the other bats a bat attends to; a bat is never its own neighbour.
 *  separation is in flight order, alignment and cohesion nearest first */
export interface INeighbourhood {
  separation: number[];
  alignment: number[];
  cohesion: number[];
}

export function emptyNeighbourhood(): INeighbourhood {
  return { separation: [], alignment: [], cohesion: [] };
}

/** the nearest bats a search has found so far, nearest first, held in arrays reused from search to search */
export interface INearest {
  distances: Float64Array;
  indices: Int32Array;
  /** how many the current search wants */
  wanted: number;
  /** how many it holds */
  count: number;
}

export function createNearest(capacity: number): INearest {
  return {
    distances: new Float64Array(capacity),
    indices: new Int32Array(capacity),
    wanted: 0,
    count: 0,
  };
}

/** how many nearest neighbours a search must find: the larger of the two counts, as a whole number */
function wantedBy(awareness: IAwareness): number {
  return Math.max(0, Math.floor(Math.max(awareness.alignment, awareness.cohesion)));
}

/** empties nearest for a search that wants this many, growing its arrays only if they are too short */
function startNearest(nearest: INearest, wanted: number): void {
  if (nearest.distances.length < wanted) {
    nearest.distances = new Float64Array(wanted);
    nearest.indices = new Int32Array(wanted);
  }
  nearest.wanted = wanted;
  nearest.count = 0;
}

/** nearer first, and at an equal distance the lower index first, so the answer never depends on the order bats are met */
function nearer(
  distance: number,
  index: number,
  otherDistance: number,
  otherIndex: number
): boolean {
  return distance < otherDistance || (distance === otherDistance && index < otherIndex);
}

/** offers one bat to the search, which keeps it if it is among the nearest so far */
export function offerNearest(nearest: INearest, distance: number, index: number): void {
  const { distances, indices, wanted } = nearest;
  if (wanted === 0) {
    return;
  }
  let at = nearest.count;
  if (at === wanted) {
    if (!nearer(distance, index, distances[at - 1], indices[at - 1])) {
      return;
    }
    at--;
  } else {
    nearest.count++;
  }
  while (at > 0 && nearer(distance, index, distances[at - 1], indices[at - 1])) {
    distances[at] = distances[at - 1];
    indices[at] = indices[at - 1];
    at--;
  }
  distances[at] = distance;
  indices[at] = index;
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

const byIndex = (a: number, b: number): number => a - b;

function startNeighbourhood(into: INeighbourhood): void {
  into.separation.length = 0;
  into.alignment.length = 0;
  into.cohesion.length = 0;
}

/** hands the nearest out to the two topological behaviours, and puts separation in flight order,
 *  which the grid would otherwise leave in the order its buckets happened to be searched */
function finishNeighbourhood(into: INeighbourhood, nearest: INearest, awareness: IAwareness): void {
  const aligning = Math.floor(awareness.alignment);
  const cohering = Math.floor(awareness.cohesion);
  for (let n = 0; n < nearest.count; n++) {
    if (n < aligning) {
      into.alignment.push(nearest.indices[n]);
    }
    if (n < cohering) {
      into.cohesion.push(nearest.indices[n]);
    }
  }
  into.separation.sort(byIndex);
}

/** offers bat j, this far away, to the search: into separation if it is close enough, and to the nearest if it could
 *  be among them. most bats a search measures are not, so they are turned away here before the sorted insert */
function measure(
  distance: number,
  j: number,
  separation: number,
  into: INeighbourhood,
  nearest: INearest
): void {
  if (distance <= separation) {
    into.separation.push(j);
  }
  if (nearest.count < nearest.wanted || distance <= nearest.distances[nearest.wanted - 1]) {
    offerNearest(nearest, distance, j);
  }
}

/** measures bat self against every other bat */
function measureEveryone(
  flight: IFlight,
  self: number,
  awareness: IAwareness,
  into: INeighbourhood,
  nearest: INearest
): void {
  startNeighbourhood(into);
  startNearest(nearest, wantedBy(awareness));
  const separation = awareness.separation ** 2;
  const quantity = flight.positions.length / 3;
  for (let j = 0; j < quantity; j++) {
    if (j !== self) {
      measure(distanceSquared(flight.positions, self, j), j, separation, into, nearest);
    }
  }
}

/** what bat self can see of the flock, measured against every other bat: n² per tick across the flock.
 *  the reference perceiveNearby is held to, and fine for a handful of bats.
 *  pass the previous tick's neighbourhood as into and its arrays are emptied and reused rather than reallocated */
export function perceive(
  flight: IFlight,
  self: number,
  awareness: IAwareness,
  into: INeighbourhood = emptyNeighbourhood(),
  nearest: INearest = createNearest(0)
): INeighbourhood {
  measureEveryone(flight, self, awareness, into, nearest);
  finishNeighbourhood(into, nearest, awareness);
  return into;
}

/** how many cells out from its own a search will walk before it gives up and measures everyone instead */
export const SEARCH_REACH = 8;

/** every cell within SEARCH_REACH of a home cell, ordered by the least distance, in cells squared, that any point in
 *  the home cell could be from any point in that cell. built once: nearest first is what lets a search stop early */
const OFFSETS = ((): { readonly cells: Int8Array; readonly floors: Float64Array } => {
  const found: Array<[number, number, number, number]> = [];
  const gap = (d: number): number => Math.max(Math.abs(d) - 1, 0) ** 2;
  for (let dx = -SEARCH_REACH; dx <= SEARCH_REACH; dx++) {
    for (let dy = -SEARCH_REACH; dy <= SEARCH_REACH; dy++) {
      for (let dz = -SEARCH_REACH; dz <= SEARCH_REACH; dz++) {
        found.push([gap(dx) + gap(dy) + gap(dz), dx, dy, dz]);
      }
    }
  }
  found.sort((p, q) => p[0] - q[0]);
  return {
    cells: Int8Array.from(found.flatMap(([, dx, dy, dz]) => [dx, dy, dz])),
    floors: Float64Array.from(found.map(([floor]) => floor)),
  };
})();

/** the squared distance from a coordinate to the nearer edge of the cell span [low, low + size], or 0 inside it */
function gapSquared(value: number, low: number, size: number): number {
  const below = low - value;
  const above = value - (low + size);
  const gap = below > 0 ? below : above > 0 ? above : 0;
  return gap * gap;
}

/** measures every bat in one bucket against bat self */
function searchBucket(
  grid: ISpatialGrid,
  bucket: number,
  positions: Float32Array,
  self: number,
  separation: number,
  into: INeighbourhood,
  nearest: INearest
): void {
  const a = self * 3;
  const px = positions[a];
  const py = positions[a + 1];
  const pz = positions[a + 2];
  for (let k = grid.starts[bucket]; k < grid.starts[bucket + 1]; k++) {
    const j = grid.order[k];
    if (j !== self) {
      const b = j * 3;
      const x = positions[b] - px;
      const y = positions[b + 1] - py;
      const z = positions[b + 2] - pz;
      measure(x * x + y * y + z * z, j, separation, into, nearest);
    }
  }
}

/** the furthest a bat can be and still matter: the separation sphere, and the furthest of the nearest once there are
 *  enough of them; until there are, anything might */
function boundOf(nearest: INearest, separation: number): number {
  if (nearest.wanted === 0) {
    return separation;
  }
  if (nearest.count < nearest.wanted) {
    return Infinity;
  }
  return Math.max(nearest.distances[nearest.wanted - 1], separation);
}

/** what bat self can see of the flock, found through the grid: exactly what perceive finds, without measuring the
 *  bats that cannot be in it. cells are visited nearest first; each is skipped if no point of it is nearer than the
 *  furthest bat the search still needs, and the search stops at the first cell that no point of self's own cell could
 *  be nearer to. a straggler whose neighbours lie beyond SEARCH_REACH falls back to measuring everyone, which is
 *  rare and always right. the grid must be filled first */
export function perceiveNearby(
  grid: ISpatialGrid,
  flight: IFlight,
  self: number,
  awareness: IAwareness,
  into: INeighbourhood,
  nearest: INearest
): INeighbourhood {
  const wanted = wantedBy(awareness);
  const { positions } = flight;
  // a flock no bigger than the count wanted is all neighbours: nothing to prune, and no bound would ever tighten
  if (positions.length / 3 - 1 <= wanted) {
    return perceive(flight, self, awareness, into, nearest);
  }
  startNeighbourhood(into);
  startNearest(nearest, wanted);
  const { cellSize, stamps } = grid;
  const cellArea = cellSize * cellSize;
  const separation = awareness.separation ** 2;
  const stamp = ++grid.search;
  const a = self * 3;
  const px = positions[a];
  const py = positions[a + 1];
  const pz = positions[a + 2];
  const hx = cellOf(px, cellSize);
  const hy = cellOf(py, cellSize);
  const hz = cellOf(pz, cellSize);
  let bound = boundOf(nearest, separation);
  let finished = false;

  for (let o = 0; o < OFFSETS.floors.length; o++) {
    if (OFFSETS.floors[o] * cellArea > bound) {
      finished = true;
      break;
    }
    const ix = hx + OFFSETS.cells[o * 3];
    const iy = hy + OFFSETS.cells[o * 3 + 1];
    const iz = hz + OFFSETS.cells[o * 3 + 2];
    const reach =
      gapSquared(px, ix * cellSize, cellSize) +
      gapSquared(py, iy * cellSize, cellSize) +
      gapSquared(pz, iz * cellSize, cellSize);
    if (reach > bound) {
      continue;
    }
    const bucket = bucketOfCell(grid, ix, iy, iz);
    // two cells can hash to one bucket; its bats are measured the first time either is reached
    if (stamps[bucket] === stamp) {
      continue;
    }
    stamps[bucket] = stamp;
    searchBucket(grid, bucket, positions, self, separation, into, nearest);
    bound = boundOf(nearest, separation);
  }
  // every cell past SEARCH_REACH is at least SEARCH_REACH cells from any point of the home cell
  if (!finished && !(bound < SEARCH_REACH * SEARCH_REACH * cellArea)) {
    measureEveryone(flight, self, awareness, into, nearest);
  }
  finishNeighbourhood(into, nearest, awareness);
  return into;
}
