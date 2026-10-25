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

/** A dBASE table's rows, as objects keyed by field name, values trimmed. */
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
      row[field.name] = dbf.toString('latin1', at, at + field.length).trim();
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
 * The smallest `viewBox` that holds every path, plus `margin` on each side, so
 * the outline fills its panel rather than the frame its projection was drawn
 * in. Reads the coordinates back out of the path data `pathData` writes, which
 * is all absolute pairs.
 */
export function viewBoxOf(paths, margin) {
  const numbers = paths.flatMap((d) => d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []);
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  const [left, top] = [Math.min(...xs) - margin, Math.min(...ys) - margin];
  const [right, bottom] = [Math.max(...xs) + margin, Math.max(...ys) + margin];
  return `${left} ${top} ${right - left} ${bottom - top}`;
}

/**
 * One state's rings as an SVG path: projected, simplified, rounded to whole
 * units, and with every ring that comes out smaller than `minArea` dropped.
 * That last rule is what "roughest" means in practice — it is where the
 * Florida Keys, most of the Aleutians and the smaller Hawaiian islands go. A
 * ring is closed in the source (its last point repeats its first); `Z` closes
 * it here, so the repeat is not written.
 */
export function pathData(rings, project, { tolerance, minArea }) {
  const parts = [];
  for (const ring of rings) {
    const projected = ring.map(project);
    if (ringArea(projected) < minArea) continue;
    const points = simplify(projected, tolerance)
      .slice(0, -1)
      .map(([x, y]) => [Math.round(x), Math.round(y)])
      .filter(([x, y], i, all) => i === 0 || x !== all[i - 1][0] || y !== all[i - 1][1]);
    if (points.length < 3) continue;
    parts.push(`M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`);
  }
  return parts.join('');
}
