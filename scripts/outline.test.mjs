/**
 * The tests that judge the outline arithmetic.
 *
 *     npm run test:scripts
 *
 * `build-outline.mjs` needs the network and runs by hand, so its readers and
 * projections are held here against inputs whose right answer is known
 * without fetching anything: a zip built in memory, a shapefile and a table
 * written byte by byte, and the one point a projection is defined to place.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  albersUsa,
  conicEqualArea,
  dissolve,
  equalEarth,
  equalEarthWorld,
  pathData,
  readPolygons,
  readTable,
  ringArea,
  simplify,
  unzip,
  viewBoxOf,
} from './outline.mjs';

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------- */

/** A zip of `files`, each deflated unless `stored` names it. */
function zip(files, stored = new Set()) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const method = stored.has(name) ? 0 : 8;
    const data = method === 0 ? content : deflateRawSync(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** A shapefile of polygons (`null` for a null shape), each a list of rings. */
function shapefile(polygons) {
  const records = polygons.map((rings, i) => {
    let content;
    if (rings === null) {
      content = Buffer.alloc(4);
    } else {
      const points = rings.flat();
      content = Buffer.alloc(44 + 4 * rings.length + 16 * points.length);
      content.writeInt32LE(5, 0);
      content.writeInt32LE(rings.length, 36);
      content.writeInt32LE(points.length, 40);
      let first = 0;
      rings.forEach((ring, r) => {
        content.writeInt32LE(first, 44 + 4 * r);
        first += ring.length;
      });
      const at = 44 + 4 * rings.length;
      points.forEach(([x, y], p) => {
        content.writeDoubleLE(x, at + 16 * p);
        content.writeDoubleLE(y, at + 16 * p + 8);
      });
    }
    const header = Buffer.alloc(8);
    header.writeInt32BE(i + 1, 0);
    header.writeInt32BE(content.length / 2, 4);
    return Buffer.concat([header, content]);
  });
  return Buffer.concat([Buffer.alloc(100), ...records]);
}

/** A dBASE table of character fields. */
function table(fields, rows, pad = ' ') {
  const headerLength = 32 + 32 * fields.length + 1;
  const rowLength = 1 + fields.reduce((sum, field) => sum + field.length, 0);
  const header = Buffer.alloc(headerLength);
  header.writeUInt32LE(rows.length, 4);
  header.writeUInt16LE(headerLength, 8);
  header.writeUInt16LE(rowLength, 10);
  fields.forEach((field, i) => {
    header.write(field.name, 32 + 32 * i, 'latin1');
    header[32 + 32 * i + 11] = 0x43; // 'C', a character field
    header[32 + 32 * i + 16] = field.length;
  });
  header[headerLength - 1] = 0x0d;
  const body = rows.map((row) => {
    const bytes = Buffer.alloc(rowLength, ' ');
    let at = 1;
    for (const field of fields) {
      bytes.write(String(row[field.name]).padEnd(field.length, pad), at, 'latin1');
      at += field.length;
    }
    return bytes;
  });
  return Buffer.concat([header, ...body]);
}

const square = (x, y, side) => [
  [x, y],
  [x + side, y],
  [x + side, y + side],
  [x, y + side],
  [x, y],
];

const identity = (point) => point;

/* ---------------------------------------------------------------------------
 * Reading
 * ------------------------------------------------------------------------- */

describe('unzip', () => {
  test('reads deflated and stored entries by name', () => {
    const files = unzip(
      zip(
        { 'a.shp': Buffer.from('shapes '.repeat(50)), 'b.dbf': Buffer.from('table') },
        new Set(['b.dbf'])
      )
    );
    assert.equal(files.get('a.shp').toString(), 'shapes '.repeat(50));
    assert.equal(files.get('b.dbf').toString(), 'table');
  });

  test('refuses something that is not a zip', () => {
    assert.throws(() => unzip(Buffer.alloc(64)), /not a zip/);
  });
});

describe('readPolygons', () => {
  test('returns each record as its rings of points, in order', () => {
    const polygons = readPolygons(
      shapefile([[square(0, 0, 1), square(5, 5, 2)], [square(-3, 1, 1)]])
    );
    assert.equal(polygons.length, 2);
    assert.deepEqual(polygons[0][1], square(5, 5, 2));
    assert.deepEqual(polygons[1], [square(-3, 1, 1)]);
  });

  test('keeps a null shape as an empty record, so rows still line up', () => {
    const polygons = readPolygons(shapefile([null, [square(0, 0, 1)]]));
    assert.deepEqual(polygons[0], []);
    assert.equal(polygons[1].length, 1);
  });
});

describe('readTable', () => {
  test('strips NUL padding as well as spaces: Natural Earth pads with NULs', () => {
    const rows = readTable(
      table([{ name: 'CONTINENT', length: 23 }], [{ CONTINENT: 'Asia' }], '\0')
    );
    assert.deepEqual(rows, [{ CONTINENT: 'Asia' }]);
  });

  test('reads each row by field name, trimmed', () => {
    const rows = readTable(
      table(
        [
          { name: 'STUSPS', length: 2 },
          { name: 'NAME', length: 20 },
        ],
        [
          { STUSPS: 'VT', NAME: 'Vermont' },
          { STUSPS: 'DC', NAME: 'District of Columbia' },
        ]
      )
    );
    assert.deepEqual(rows, [
      { STUSPS: 'VT', NAME: 'Vermont' },
      { STUSPS: 'DC', NAME: 'District of Columbia' },
    ]);
  });
});

/* ---------------------------------------------------------------------------
 * Projecting
 * ------------------------------------------------------------------------- */

describe('conicEqualArea', () => {
  const project = conicEqualArea({
    parallels: [29.5, 45.5],
    rotate: 96,
    center: [-0.6, 38.7],
    scale: 1070,
    translate: [480, 250],
  });

  test('places its centre exactly at its translation', () => {
    // `center` is in the rotated frame, so the real longitude is -0.6 - 96.
    const [x, y] = project([-96.6, 38.7]);
    assert.ok(Math.abs(x - 480) < 1e-9 && Math.abs(y - 250) < 1e-9, `${x}, ${y}`);
  });

  test('puts north up and east to the right', () => {
    const [, south] = project([-96, 30]);
    const [, north] = project([-96, 45]);
    const [west] = project([-110, 40]);
    const [east] = project([-80, 40]);
    assert.ok(north < south);
    assert.ok(west < east);
  });

  test('gives equal areas equal areas, the reason it was chosen', () => {
    // Two one-degree cells at the same latitude, far apart in longitude.
    const cell = (lon) => ringArea(square(lon, 40, 1).map(project));
    assert.ok(Math.abs(cell(-120) / cell(-75) - 1) < 1e-3);
  });
});

describe('albersUsa', () => {
  const projectionFor = albersUsa();

  test('insets Alaska and Hawaii below the lower 48, on the west', () => {
    const [akX, akY] = projectionFor('AK')([-150, 61]);
    const [hiX, hiY] = projectionFor('HI')([-157, 21]);
    const [, texasY] = projectionFor('TX')([-99, 31]);
    assert.ok(akX < 300 && akY > texasY, `Alaska at ${akX}, ${akY}`);
    assert.ok(hiX < 400 && hiY > texasY, `Hawaii at ${hiX}, ${hiY}`);
  });

  test('keeps the Aleutians west of the antimeridian beside the rest of Alaska', () => {
    // The western Aleutians sit at positive longitudes in the source.
    const [x] = projectionFor('AK')([179, 52]);
    const [mainland] = projectionFor('AK')([-150, 61]);
    assert.ok(Math.abs(x - mainland) < 200, `Attu at ${x}, mainland at ${mainland}`);
  });
});

/* ---------------------------------------------------------------------------
 * Roughening
 * ------------------------------------------------------------------------- */

describe('equalEarth', () => {
  const project = equalEarth({ scale: 100, translate: [0, 0] });

  test('places the origin at its translation, north up and east right', () => {
    assert.deepEqual(project([0, 0]), [0, 0]);
    assert.ok(project([0, 45])[1] < 0);
    assert.ok(project([90, 0])[0] > 0);
  });

  test('gives equal areas of the globe equal areas on the page', () => {
    // A one-degree cell's share of the sphere goes as sin(top) − sin(bottom).
    const cell = (lat) => ringArea(square(10, lat, 1).map(project));
    const sphere = (lat) => Math.sin(((lat + 1) * Math.PI) / 180) - Math.sin((lat * Math.PI) / 180);
    const ratio = cell(60) / cell(0) / (sphere(60) / sphere(0));
    assert.ok(Math.abs(ratio - 1) < 1e-3, `ratio ${ratio}`);
  });
});

describe('equalEarthWorld', () => {
  const project = equalEarthWorld();

  test('is 960 units from antimeridian to antimeridian, with the north pole on y = 0', () => {
    assert.ok(Math.abs(project([180, 0])[0] - project([-180, 0])[0] - 960) < 1e-9);
    assert.ok(Math.abs(project([0, 90])[1]) < 1e-9);
  });
});

describe('dissolve', () => {
  const sorted = (rings) => rings.map((ring) => ring.slice(0, -1).map(String).sort());

  test('merges two squares that share an edge into one ring, the border gone', () => {
    // Both run the same way round, so the shared edge appears once each way.
    const merged = dissolve([square(0, 0, 1), square(1, 0, 1)]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0][0], merged[0].at(-1), 'the ring is closed');
    assert.deepEqual(sorted(merged), [['0,0', '0,1', '1,0', '1,1', '2,0', '2,1'].sort()]);
    assert.equal(ringArea(merged[0]), 2);
  });

  test('leaves polygons that share nothing as they were', () => {
    const merged = dissolve([square(0, 0, 1), square(5, 5, 1)]);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged.map(ringArea), [1, 1]);
  });

  test('turns a gap enclosed by its neighbours into a hole', () => {
    // A 3 × 3 block of squares with the middle one missing.
    const ring = [];
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]) {
      ring.push(square(x, y, 1));
    }
    const merged = dissolve(ring);
    assert.deepEqual(merged.map(ringArea).sort(), [1, 9]);
  });
});

describe('simplify', () => {
  test('drops points that lie on the line, and keeps both ends', () => {
    assert.deepEqual(
      simplify(
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ],
        0.5
      ),
      [
        [0, 0],
        [3, 0],
      ]
    );
  });

  test('keeps a point further off the line than the tolerance', () => {
    // The peak is 3 off the base; each point either side of it is about 0.06
    // off the edge from a base corner to the peak.
    const line = [
      [0, 0],
      [1, 1.4],
      [2, 3],
      [3, 1.6],
      [4, 0],
    ];
    assert.deepEqual(simplify(line, 0.5), [
      [0, 0],
      [2, 3],
      [4, 0],
    ]);
  });
});

describe('pathData', () => {
  const options = { tolerance: 0.5, minArea: 4 };

  test('writes each ring as absolute whole units, closed with Z', () => {
    assert.equal(pathData([square(0.4, 0.4, 10)], identity, options), 'M0 0L10 0L10 10L0 10Z');
  });

  test('drops rings smaller than the minimum area: the islands an outline loses', () => {
    assert.equal(
      pathData([square(0, 0, 10), square(20, 20, 1)], identity, options),
      'M0 0L10 0L10 10L0 10Z'
    );
  });

  test('never repeats a point that rounding has merged', () => {
    const ring = [
      [0, 0],
      [0.2, 0.1],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    assert.equal(pathData([ring], identity, { tolerance: 0, minArea: 0 }), 'M0 0L10 0L10 10L0 10Z');
  });
});

describe('viewBoxOf', () => {
  test('is the bounds of every path, with the margin on each side', () => {
    assert.equal(viewBoxOf(['M10 20L30 20L30 40Z', 'M5 25L12 60Z'], 2), '3 18 29 44');
  });
});
