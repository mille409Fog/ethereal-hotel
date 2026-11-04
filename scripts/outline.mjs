/**
 * The arithmetic behind `/wanderquest`'s map outlines, kept apart from the
 * script that fetches so `outline.test.mjs` can hold it without a network.
 *
 * Everything a boundary file needs on its way to an SVG path is here, and none
 * of it is a dependency. A zip is a directory and some deflate streams, which
 * `node:zlib` already reads; a shapefile is a run of little-endian doubles; and
 * the projections are a dozen lines each. A geo library would be the larger
 * thing to explain, and it would only ever run on the owner's machine.
 *
 * The projections are written the way d3-geo writes them, constants included,
 * so an outline drawn here lines up with any map a reader has seen drawn by d3.
 */
import { inflateRawSync } from 'node:zlib';

/* ---------------------------------------------------------------------------
 * Reading the files
 * ------------------------------------------------------------------------- */

/**
 * Every file in a zip, by name. Reads the central directory rather than walking
 * local headers, because a local header may defer its sizes to a trailing
 * descriptor and the central directory never does.
 */
export function unzip(buffer) {
  const END_SIGNATURE = 0x06054b50;
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== END_SIGNATURE) end -= 1;
  if (end < 0) throw new Error('not a zip: no end-of-central-directory record');

  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);

    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + compressed);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, inflateRawSync(raw));
    else throw new Error(`${name} uses zip method ${method}, which this reader does not`);

    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/**
 * A shapefile's polygons, each as its rings of `[lon, lat]` points. Only shape
 * type 5 (polygon) is read, since a boundary file holds nothing else; a null
 * shape stays in place as an empty list so record numbers still line up with
 * the attribute table.
 */
export function readPolygons(shp) {
  const POLYGON = 5;
  const NULL_SHAPE = 0;
  const polygons = [];
  let at = 100;
  while (at < shp.length) {
    const length = shp.readInt32BE(at + 4) * 2;
    const content = at + 8;
    const type = shp.readInt32LE(content);
    if (type === NULL_SHAPE) {
      polygons.push([]);
    } else if (type === POLYGON) {
      const partCount = shp.readInt32LE(content + 36);
      const pointCount = shp.readInt32LE(content + 40);
      const parts = Array.from({ length: partCount }, (_, i) =>
        shp.readInt32LE(content + 44 + 4 * i)
      );
      const points = content + 44 + 4 * partCount;
      polygons.push(
        parts.map((first, i) => {
          const last = i + 1 < partCount ? parts[i + 1] : pointCount;
          return Array.from({ length: last - first }, (_, k) => [
            shp.readDoubleLE(points + 16 * (first + k)),
            shp.readDoubleLE(points + 16 * (first + k) + 8),
          ]);
        })
      );
    } else {
      throw new Error(`shape type ${type} is not a polygon`);
    }
    at = content + length;
  }
  return polygons;
}

/**
 * A dBASE table's rows, as objects keyed by field name, values trimmed. A
 * field is padded with spaces by the Census and with NULs by Natural Earth;
 * both are padding, so both go. Values are UTF-8, as both publishers' `.cpg`
 * says: read as Latin-1, Curaçao came out as "CuraÃ§ao" in a header. Field
 * names stay Latin-1, which for their ASCII is the same thing.
 */
export function readTable(dbf) {
  const rowCount = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const rowLength = dbf.readUInt16LE(10);

  const fields = [];
  for (let at = 32; dbf[at] !== 0x0d; at += 32) {
    const name = dbf.toString('latin1', at, at + 11).replace(/\0.*$/, '');
    fields.push({ name, length: dbf[at + 16] });
  }

  const rows = [];
  for (let r = 0; r < rowCount; r += 1) {
    // Each row opens with a one-byte deletion flag.
    let at = headerLength + r * rowLength + 1;
    const row = {};
    for (const field of fields) {
      row[field.name] = dbf
        .toString('utf8', at, at + field.length)
        .replace(/\0/g, '')
        .trim();
      at += field.length;
    }
    rows.push(row);
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * Projecting
 * ------------------------------------------------------------------------- */

const RADIANS = Math.PI / 180;

/**
 * Albers' conic equal-area projection between two standard parallels, as d3's
 * `geoConicEqualArea`: `rotate` is the longitude brought to the centre, and
 * `center` is the rotated point placed at `translate`. Returns `[x, y]` in
 * screen space, y down.
 */
export function conicEqualArea({ parallels, rotate, center, scale, translate }) {
  const sy0 = Math.sin(parallels[0] * RADIANS);
  const n = (sy0 + Math.sin(parallels[1] * RADIANS)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = Math.sqrt(c) / n;

  const raw = (lambda, phi) => {
    const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
    return [r * Math.sin(lambda * n), r0 - r * Math.cos(lambda * n)];
  };
  const wrap = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;
  const [cx, cy] = raw(center[0] * RADIANS, center[1] * RADIANS);

  return ([lon, lat]) => {
    const [x, y] = raw(wrap(lon + rotate) * RADIANS, lat * RADIANS);
    return [translate[0] + scale * (x - cx), translate[1] - scale * (y - cy)];
  };
}

/**
 * d3's `geoAlbersUsa` at its defaults, scale 1070 into a 960 × 600 frame: the
 * lower 48 in Albers, with Alaska shrunk to 0.35 and moved under California,
 * and Hawaii moved beside it. Which projection a point takes is decided by the
 * state it belongs to rather than by testing the point against d3's clip boxes,
 * because the caller always knows the state and a box can only guess.
 */
export const USA_FRAME = { width: 960, height: 600 };

export function albersUsa() {
  const k = 1070;
  const [x, y] = [USA_FRAME.width / 2, 250];
  const lower48 = conicEqualArea({
    parallels: [29.5, 45.5],
    rotate: 96,
    center: [-0.6, 38.7],
    scale: k,
    translate: [x, y],
  });
  const alaska = conicEqualArea({
    parallels: [55, 65],
    rotate: 154,
    center: [-2, 58.5],
    scale: 0.35 * k,
    translate: [x - 0.307 * k, y + 0.201 * k],
  });
  const hawaii = conicEqualArea({
    parallels: [8, 18],
    rotate: 157,
    center: [-3, 19.9],
    scale: k,
    translate: [x - 0.205 * k, y + 0.212 * k],
  });
  return (id) => (id === 'AK' ? alaska : id === 'HI' ? hawaii : lower48);
}

/**
 * Šavrič, Patterson & Jenny's Equal Earth (2018), centred on Greenwich, as d3's
 * `geoEqualEarth`. Equal-area, so Africa is drawn fourteen times Greenland as
 * it is, and its pole is a line rather than a point, so Antarctica reads as a
 * continent rather than a smear. Returns `[x, y]` in screen space, y down,
 * with `(0°, 0°)` at `translate`.
 */
export function equalEarth({ scale, translate }) {
  const [A1, A2, A3, A4] = [1.340264, -0.081106, 0.000893, 0.003796];
  const M = Math.sqrt(3) / 2;
  return ([lon, lat]) => {
    const theta = Math.asin(M * Math.sin(lat * RADIANS));
    const t2 = theta * theta;
    const t6 = t2 * t2 * t2;
    const x =
      (lon * RADIANS * Math.cos(theta)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
    const y = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
    return [translate[0] + scale * x, translate[1] - scale * y];
  };
}

/**
 * The world in Equal Earth, scaled so the whole globe is 960 units across: the
 * width the states outline was drawn at, so the two read at one stroke weight.
 */
export const WORLD_FRAME = { width: 960 };

export function equalEarthWorld() {
  // The projected half-width at the equator, x(180°, 0°) before scaling.
  const halfWidth = Math.PI / ((Math.sqrt(3) / 2) * 1.340264);
  const scale = WORLD_FRAME.width / (2 * halfWidth);
  // Drop the north pole onto y = 0.
  const [, pole] = equalEarth({ scale, translate: [0, 0] })([0, 90]);
  return equalEarth({ scale, translate: [WORLD_FRAME.width / 2, -pole] });
}

/**
 * The whole globe's edge as one ring of `[lon, lat]`, d3's `{type: 'Sphere'}`
 * for a projection centred on Greenwich: down the antimeridian's east side
 * from pole to pole, then up its west side. The closing edges are the poles,
 * which Equal Earth draws as straight lines, so a point at each end is all
 * they need; the meridians bow, so they are sampled every `step` degrees and
 * left to `simplify` to thin. Closed, as a boundary file's rings are.
 */
export function sphereRing(step = 1) {
  const ring = [];
  for (let lat = 90; lat >= -90; lat -= step) ring.push([180, lat]);
  for (let lat = -90; lat <= 90; lat += step) ring.push([-180, lat]);
  return [...ring, ring[0]];
}

/**
 * The smallest whole-unit rectangle that holds a box of longitude and latitude
 * once projected. Its edges are sampled rather than its corners projected,
 * because in Equal Earth a meridian bows outward and a parallel is straight
 * but no corner need be the extreme of either.
 */
export function projectedBounds(project, { west, east, south, north }, samples = 64) {
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const lon = west + ((east - west) * i) / samples;
    const lat = south + ((north - south) * i) / samples;
    points.push(project([lon, south]), project([lon, north]));
    points.push(project([west, lat]), project([east, lat]));
  }
  const b = boundsOf(points);
  return {
    left: Math.floor(b.left),
    top: Math.floor(b.top),
    right: Math.ceil(b.right),
    bottom: Math.ceil(b.bottom),
  };
}

/**
 * A projection for one place drawn on its own: Albers' equal-area conic
 * centred on the place, with its standard parallels a sixth of the way in from
 * the edges of its latitude, the usual rule for a region. Unit scale, centre at
 * the origin; `fitTile` sizes it. None of the places it is used for crosses
 * the antimeridian, so the centre is a plain midpoint.
 */
export function localEqualArea(rings) {
  const points = rings.flat();
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  const [south, north] = [Math.min(...lats), Math.max(...lats)];
  const sixth = (north - south) / 6;
  return conicEqualArea({
    parallels: [south + sixth, north - sixth],
    rotate: -(Math.min(...lons) + Math.max(...lons)) / 2,
    center: [0, (south + north) / 2],
    scale: 1,
    translate: [0, 0],
  });
}

function boundsOf(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/**
 * `project` scaled and shifted so a place fills `tile`, a square `size` across
 * at `x, y` less `padding` on each side, and the rings that are drawn there.
 *
 * Fitting to every ring would let a speck decide the scale: American Samoa's
 * extent is set by Rose Atoll and Swains Island, 280 and 360 km from Tutuila,
 * and fitted to them Tutuila is a dot in an empty tile. So the fit repeats.
 * Each pass keeps the rings that lie inside the current extent and are at
 * least `minArea` at its scale, then fits to those. The extent can only
 * shrink, so the scale only grows and it settles; a ring dropped for its size
 * is reconsidered at the larger scale if it is still inside. The largest ring
 * is always kept, so a place can lose an islet but never itself.
 */
export function fitTile(rings, project, { x, y, size, padding }, minArea) {
  const projected = rings.map((ring) => ring.map(project));
  const largest = projected.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best));
  const inner = size - 2 * padding;

  let kept = projected;
  let bounds = boundsOf(kept.flat());
  for (;;) {
    const scale = inner / Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const inside = (ring) => {
      const b = boundsOf(ring);
      return (
        b.left >= bounds.left &&
        b.right <= bounds.right &&
        b.top >= bounds.top &&
        b.bottom <= bounds.bottom
      );
    };
    const next = projected.filter(
      (ring) => ring === largest || (inside(ring) && ringArea(ring) * scale * scale >= minArea)
    );
    const nextBounds = boundsOf(next.flat());
    const settled = ['left', 'top', 'right', 'bottom'].every(
      (side) => nextBounds[side] === bounds[side]
    );
    kept = next;
    bounds = nextBounds;
    if (settled) break;
  }

  const scale = inner / Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top);
  const offsetX = x + (size - scale * (bounds.right - bounds.left)) / 2 - scale * bounds.left;
  const offsetY = y + (size - scale * (bounds.bottom - bounds.top)) / 2 - scale * bounds.top;
  return {
    project: (point) => {
      const [px, py] = project(point);
      return [offsetX + scale * px, offsetY + scale * py];
    },
    rings: rings.filter((_, i) => kept.includes(projected[i])),
    /** Frame units per unit of the unscaled projection: on a unit sphere, per Earth radius. */
    scale,
  };
}

/**
 * The rings of path data as `pathData` writes it, `M…L…Z` in whole units, back
 * as points: what is drawn, after simplifying and dropping, rather than what
 * was projected. Not for a dot, whose arcs it does not read.
 */
export function ringsOfPath(d) {
  return d
    .split('Z')
    .filter(Boolean)
    .map((ring) =>
      ring
        .slice(1)
        .split('L')
        .map((point) => point.split(' ').map(Number))
    );
}

/**
 * Rings gathered into island groups: two rings whose bounding boxes come
 * within `gap` of each other are one group, and so is anything either is near,
 * so a chain joins end to end. In ring order, by each group's first ring.
 */
export function islandGroups(rings, gap) {
  const boxes = rings.map(boundsOf);
  const near = (a, b) =>
    a.left - gap <= b.right &&
    b.left - gap <= a.right &&
    a.top - gap <= b.bottom &&
    b.top - gap <= a.bottom;
  const group = rings.map((_, i) => i);
  const root = (i) => (group[i] === i ? i : root(group[i]));
  boxes.forEach((one, i) =>
    boxes.slice(0, i).forEach((two, j) => {
      if (near(one, two)) group[root(i)] = root(j);
    })
  );
  const groups = new Map();
  rings.forEach((ring, i) => {
    const key = root(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ring);
  });
  return [...groups.values()];
}

/**
 * A circle round some points in whole units: centred on their bounds, out to
 * the farthest of them, and `clearance` beyond it so a stroke on the circle
 * never touches what it rings. Not the smallest circle, which would need
 * Welzl's algorithm to save a unit or two on a shape this script never draws.
 */
export function circleAround(points, clearance) {
  const b = boundsOf(points);
  const [cx, cy] = [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)];
  const farthest = Math.max(...points.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  return { cx, cy, r: Math.ceil(farthest) + clearance };
}

/* ---------------------------------------------------------------------------
 * Dissolving
 * ------------------------------------------------------------------------- */

/**
 * The rings of several polygons merged into the rings of their union, by
 * cancelling every border two of them share.
 *
 * This is not a general polygon union, and does not need to be: Natural Earth
 * draws a shared border once and gives both neighbours the same vertices, so
 * the border appears as an edge in each ring, once in each direction (outer
 * rings run the same way round). An edge whose reverse is also present is
 * interior; every other edge is on the outside of the union, and following
 * them end to start walks its rings. Holes come out as rings of their own, run
 * the other way, which is what a nonzero fill needs. Two borders that do not
 * share vertices are not merged, and show as a line, which an outline can
 * afford.
 */
export function dissolve(rings) {
  const key = ([x, y]) => `${x},${y}`;
  const edges = [];
  const byDirection = new Map();
  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i += 1) {
      const [from, to] = [key(ring[i]), key(ring[i + 1])];
      if (from === to) continue;
      const edge = { from, to, start: ring[i], used: false };
      edges.push(edge);
      const direction = `${from}>${to}`;
      if (!byDirection.has(direction)) byDirection.set(direction, []);
      byDirection.get(direction).push(edge);
    }
  }

  // Cancel each edge against one running the other way, as many times as
  // both directions have an edge to give.
  for (const [direction, forward] of byDirection) {
    const [from, to] = direction.split('>');
    const backward = byDirection.get(`${to}>${from}`) ?? [];
    const pairs = Math.min(
      forward.filter((edge) => !edge.used).length,
      backward.filter((edge) => !edge.used).length
    );
    for (const list of [forward, backward]) {
      list
        .filter((edge) => !edge.used)
        .slice(0, pairs)
        .forEach((edge) => (edge.used = true));
    }
  }

  const outgoing = new Map();
  for (const edge of edges) {
    if (edge.used) continue;
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }

  const merged = [];
  for (const first of edges) {
    if (first.used) continue;
    const ring = [];
    let edge = first;
    while (edge && !edge.used) {
      edge.used = true;
      ring.push(edge.start);
      edge = outgoing.get(edge.to)?.find((next) => !next.used);
    }
    if (ring.length >= 3) merged.push([...ring, ring[0]]);
  }
  return merged;
}

/* ---------------------------------------------------------------------------
 * Roughening
 * ------------------------------------------------------------------------- */

/** A ring's area in screen units, unsigned. The shoelace formula. */
export function ringArea(ring) {
  let twice = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    twice += x0 * y1 - x1 * y0;
  }
  return Math.abs(twice) / 2;
}

function offLine([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
}

/**
 * Douglas–Peucker: the fewest points of `line` that stay within `tolerance` of
 * it. Iterative, because a coastline is long enough to make recursion a risk.
 * Both ends are always kept.
 */
export function simplify(line, tolerance) {
  if (line.length < 3) return line.slice();
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let farthest = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i += 1) {
      const d = offLine(line[i], line[first], line[last]);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/**
 * The centroid of some rings in screen units, each weighted by its area, so
 * a country of several islands is centred on its land rather than on the sea
 * between them. Signed, so a hole subtracts. In an equal-area projection the
 * screen area is the ground area, so this is the centroid of the place.
 */
export function centroid(rings) {
  let [area, x, y] = [0, 0, 0];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      x += (x0 + x1) * cross;
      y += (y0 + y1) * cross;
    }
  }
  return [x / (3 * area), y / (3 * area)];
}

/**
 * A dot of `radius` at `[x, y]`, as path data: a circle drawn as two half
 * arcs, whole units throughout. A path rather than a `<circle>` so a place
 * drawn as a dot is the same element as one drawn as a shape, and whatever
 * fills, hovers or lights one needs no branch for the other.
 */
export function dotData([x, y], radius) {
  const [left, right, middle] = [Math.round(x) - radius, Math.round(x) + radius, Math.round(y)];
  const half = `A${radius} ${radius} 0 1 0`;
  return `M${left} ${middle}${half} ${right} ${middle}${half} ${left} ${middle}Z`;
}

/**
 * The smallest `viewBox` that holds every path, plus `margin` on each side, so
 * the outline fills its panel rather than the frame its projection was drawn
 * in. Reads the coordinates back out of the path data `pathData` and
 * `dotData` write: absolute pairs after `M` and `L`, and after `A` a radius
 * and six more numbers ending in the arc's end. The arcs are only ever a
 * dot's halves, which end level with its centre, so the dot's top and bottom
 * are each end a radius up and down.
 */
export function viewBoxOf(paths, margin) {
  const points = paths.flatMap((d) =>
    [...d.matchAll(/([MLA])([^MLAZ]+)/g)].flatMap(([, command, args]) => {
      const numbers = args.trim().split(/\s+/).map(Number);
      if (command !== 'A') return [numbers];
      const [radius, , , , , x, y] = numbers;
      return [
        [x, y - radius],
        [x, y + radius],
      ];
    })
  );
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [left, top] = [Math.min(...xs) - margin, Math.min(...ys) - margin];
  const [right, bottom] = [Math.max(...xs) + margin, Math.max(...ys) + margin];
  return `${left} ${top} ${right - left} ${bottom - top}`;
}

/**
 * A projected ring cut to a rectangle, Sutherland–Hodgman: each side of the
 * rectangle in turn keeps what is inside it and puts a point where an edge
 * crosses it. A ring wholly outside comes back empty. A concave ring that
 * leaves and re-enters comes back as one ring with a seam along the side it
 * left by; filled, the seam has no area and draws nothing, and that is all an
 * outline needs from a clip. Closed in, closed out.
 */
export function clipRing(ring, { left, top, right, bottom }) {
  const sides = [
    { inside: ([x]) => x >= left, cross: (a, b) => at(a, b, 0, left) },
    { inside: ([x]) => x <= right, cross: (a, b) => at(a, b, 0, right) },
    { inside: ([, y]) => y >= top, cross: (a, b) => at(a, b, 1, top) },
    { inside: ([, y]) => y <= bottom, cross: (a, b) => at(a, b, 1, bottom) },
  ];
  // Where the edge from `a` to `b` reaches `value` on `axis`.
  function at(a, b, axis, value) {
    const t = (value - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }

  let points = ring.slice(0, -1);
  for (const { inside, cross } of sides) {
    const next = [];
    points.forEach((point, i) => {
      const previous = points[(i + points.length - 1) % points.length];
      if (inside(point)) {
        if (!inside(previous)) next.push(cross(previous, point));
        next.push(point);
      } else if (inside(previous)) {
        next.push(cross(previous, point));
      }
    });
    points = next;
    if (points.length === 0) return [];
  }
  return [...points, points[0]];
}

/**
 * One state's rings as an SVG path: projected, simplified, rounded to whole
 * units, and with every ring that comes out smaller than `minArea` dropped.
 * That last rule is what "roughest" means in practice — it is where the
 * Florida Keys, most of the Aleutians and the smaller Hawaiian islands go. A
 * ring is closed in the source (its last point repeats its first); `Z` closes
 * it here, so the repeat is not written. Given `clip`, a rectangle in
 * projected units, each ring is cut to it before anything else is decided,
 * so a coast that runs on past the frame is neither drawn nor counted.
 */
export function pathData(rings, project, { tolerance, minArea, clip }) {
  const parts = [];
  for (const ring of rings) {
    const projected = clip ? clipRing(ring.map(project), clip) : ring.map(project);
    if (projected.length === 0 || ringArea(projected) < minArea) continue;
    const points = simplify(projected, tolerance)
      .slice(0, -1)
      .map(([x, y]) => [Math.round(x), Math.round(y)])
      .filter(([x, y], i, all) => i === 0 || x !== all[i - 1][0] || y !== all[i - 1][1]);
    if (points.length < 3) continue;
    parts.push(`M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`);
  }
  return parts.join('');
}
