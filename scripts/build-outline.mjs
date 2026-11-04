/**
 * Builds `/wanderquest`'s map outlines from public-domain boundary files.
 *
 *     npm run outline:build                    # every outline
 *     npm run outline:build -- continents      # just the named ones
 *
 * The targets are `states`, `bonus`, `continents` and `countries`; the last
 * also writes each of `INSETS`, Europe's and the Caribbean's, because the
 * world map's note depends on them.
 *
 * Like `fetch-gallery.mjs`, this writes a build *input*: each output is a
 * committed TypeScript module of SVG path data, so the build fetches nothing,
 * a visitor's browser contacts no map host, and the bundle carries no
 * projection library. It needs the network and runs by hand; CI never runs
 * it, and `outline.spec.ts` checks what it committed.
 *
 * An outline is deliberately the roughest thing that still reads as the
 * place. Each source is the coarsest scale its publisher offers, and it is
 * roughened further on the way: simplified to `TOLERANCE`, rounded to whole
 * units, and stripped of every island smaller than `MIN_AREA`, all in frames
 * 960 units across so the outlines share a stroke weight. The bonus is the
 * exception: six places an ocean apart cannot share a frame, so it is six
 * tiles, each fitted to its place (see `buildBonus`). The spec holds each
 * result under a size ceiling, so a tolerance nudged down for looks has to
 * raise that number in plain sight.
 *
 * The place lists are read from `src/app/wanderquest/places.data.ts` (Node
 * strips the types), so there is no second list to drift. A place the source
 * does not carry stops the script; a feature that is not one of the places is
 * left out and named, on the console and in the generated file's header.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

import { BONUS, CONTINENTS, COUNTRIES, STATES } from '../src/app/wanderquest/places.data.ts';
import {
  albersUsa,
  centroid,
  circleAround,
  dissolve,
  dotData,
  equalEarthWorld,
  fitTile,
  islandGroups,
  localEqualArea,
  pathData,
  projectedBounds,
  readPolygons,
  readTable,
  ringArea,
  ringsOfPath,
  sphereRing,
  unzip,
  USA_FRAME,
  viewBoxOf,
} from './outline.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repoRoot, 'src', 'app', 'wanderquest');

/** How far, in frame units, a simplified edge may stray from the source. */
const TOLERANCE = 1.5;

/** Rings smaller than this many square frame units are not drawn. */
const MIN_AREA = 12;

/** Room left around the drawn shapes, so a border stroke is not clipped. */
const MARGIN = 2;

const ROUGHENING = { tolerance: TOLERANCE, minArea: MIN_AREA };

/**
 * The globe's edge is simplified finer than the land. At `TOLERANCE` the
 * equator's bulge is cut a unit inward, and a coast that reaches the
 * antimeridian would then poke past the edge of the world it sits on. At this
 * value what is left is whole-unit rounding, 0.75 at most (Chukotka), and
 * finer costs bytes without closing it: 0.62 at 0.1, 0.45 unsimplified.
 */
const SPHERE_ROUGHENING = { tolerance: 0.5, minArea: 0 };

/**
 * The countries' smaller minimum. An island the states and continents lose is
 * a piece of a place; on the countries map it is often the whole place, and at
 * `MIN_AREA` Fiji, Jamaica, Cyprus, Qatar and eleven more went. At this value
 * four are still lost, because rounding collapses them below a triangle.
 */
const COUNTRY_MIN_AREA = 1;

/** One file out of a zipped shapefile, by suffix, from a fetch per zip. */
async function fetchZip(source, name) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${source} answered ${response.status}`);
  const files = unzip(Buffer.from(await response.arrayBuffer()));
  return (suffix) => {
    const found = files.get(`${name}${suffix}`);
    if (!found) throw new Error(`${name}.zip has no ${suffix}`);
    return found;
  };
}

/** A zipped shapefile's geometry and attribute table, and any other file asked for. */
async function fetchShapefile(source, name, extra = []) {
  const file = await fetchZip(source, name);
  return {
    polygons: readPolygons(file('.shp')),
    rows: readTable(file('.dbf')),
    extra: Object.fromEntries(extra.map((suffix) => [suffix, file(suffix).toString('utf8')])),
  };
}

/** The width a header comment is wrapped to, its ` * ` included. */
const COMMENT_WIDTH = 80;

/**
 * `text` as the body of a block comment: each paragraph reflowed to
 * `COMMENT_WIDTH`, since Prettier leaves comments alone and the header is
 * assembled from names and lists of any length. A word longer than the line
 * (a URL) gets a line to itself.
 */
function commentBody(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const lines = [];
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (line && ` * ${line} ${word}`.length > COMMENT_WIDTH) {
          lines.push(line);
          line = word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
      }
      return [...lines, line].map((wrapped) => ` * ${wrapped}`).join('\n');
    })
    .join('\n *\n');
}

/**
 * Writes one outline module, formatted as the repo formats it. A place in
 * `list` with no shape is left out of `shapes` rather than written empty, and
 * `unkeyed` is land drawn for context that is none of the places. `viewBox`
 * replaces the crop to the shapes, for a frame laid out in advance, and
 * `tiles` is that layout. The places in `onTop` are written after the rest,
 * in list order, so they paint over them, and `note` is said on the panel.
 * `enlarges` is the rectangle of another outline an inset draws larger, and
 * `sphere` the globe's edge the places sit on, which the crop holds whole.
 */
async function writeOutline({
  file,
  header,
  typeName,
  constName,
  label,
  list,
  shapes,
  onTop,
  note,
  unkeyed,
  viewBox,
  tiles,
  enlarges,
  sphere,
}) {
  const output = path.join(outputDirectory, file);
  const last = (place) => (onTop?.has(place.id) ? 1 : 0);
  const entries = list
    .filter((place) => shapes.get(place.id))
    .sort((one, two) => last(one) - last(two))
    .map((place) => `  { id: '${place.id}', d: '${shapes.get(place.id)}' },`);
  const drawn = [...shapes.values(), ...(unkeyed ? [unkeyed] : [])].filter(Boolean);
  const cropped = sphere ? [...drawn, sphere] : drawn;
  const tileEntries = (tiles ?? []).map(
    (tile) =>
      `  { id: '${tile.id}', x: ${tile.x}, y: ${tile.y}, size: ${tile.size}, name: { x: ${tile.name.x}, y: ${tile.name.y} }${tile.partial ? `, partial: '${tile.partial}'` : ''}${tile.circles ? `, circles: [${tile.circles.map(({ cx, cy, r }) => `{ cx: ${cx}, cy: ${cy}, r: ${r} }`).join(', ')}]` : ''} },`
  );
  const source = `/**
${commentBody(header)}
 */
import type { ${typeName} } from './places.data';
import type { IOutline } from './outline';

export const ${constName}: IOutline<${typeName}> = {
  label: '${label}',
  viewBox: '${viewBox ?? viewBoxOf(cropped, MARGIN)}',
  shapes: [
${entries.join('\n')}
  ],${note ? `\n  note: ${JSON.stringify(note)},` : ''}${unkeyed ? `\n  unkeyed: '${unkeyed}',` : ''}${sphere ? `\n  sphere: '${sphere}',` : ''}${tiles ? `\n  tiles: [\n${tileEntries.join('\n')}\n  ],` : ''}${enlarges ? `\n  enlarges: { x: ${enlarges.x}, y: ${enlarges.y}, width: ${enlarges.width}, height: ${enlarges.height} },` : ''}
};
`;
  const options = (await prettier.resolveConfig(output)) ?? {};
  await writeFile(output, await prettier.format(source, { ...options, filepath: output }));

  const bytes = drawn.reduce((sum, d) => sum + d.length, 0);
  console.log(
    `Wrote ${path.relative(repoRoot, output)}: ${entries.length} shapes, ${bytes} bytes of path data.`
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------------------------
 * The fifty states
 * ------------------------------------------------------------------------- */

/** The Census's newest vintage, at 1:20,000,000, the coarsest of its three scales. */
const CENSUS_VINTAGE = 2025;

async function buildStates() {
  const name = `cb_${CENSUS_VINTAGE}_us_state_20m`;
  const source = `https://www2.census.gov/geo/tiger/GENZ${CENSUS_VINTAGE}/shp/${name}.zip`;
  const { polygons, rows } = await fetchShapefile(source, name);
  const wanted = new Set(STATES.map((state) => state.id));
  const projectionFor = albersUsa();

  const shapes = new Map();
  const skipped = [];
  rows.forEach((row, i) => {
    const id = row.STUSPS;
    if (!wanted.has(id)) {
      skipped.push(`${id} (${row.NAME})`);
      return;
    }
    shapes.set(id, pathData(polygons[i], projectionFor(id), ROUGHENING));
  });

  const missing = STATES.filter((state) => !shapes.get(state.id));
  if (missing.length > 0) {
    throw new Error(`${name} has no drawable shape for ${missing.map((s) => s.id).join(', ')}`);
  }

  await writeOutline({
    file: 'states.outline.ts',
    header: `
The fifty states, outlined. GENERATED by \`npm run outline:build\`
(\`scripts/build-outline.mjs\`) — edit the script, not this file.

Source: US Census Bureau, ${CENSUS_VINTAGE} cartographic boundary file, states,
1:20,000,000 (\`${name}\`), a work of the US government and so in the
public domain. ${source}
Fetched ${today()}.

Projected as d3's \`geoAlbersUsa\` into a ${USA_FRAME.width} × ${USA_FRAME.height} frame, Alaska and
Hawaii inset, then cropped to the shapes; simplified to ${TOLERANCE} units, rounded to
whole units, islands under ${MIN_AREA} square units dropped. Left out because they are
not states: ${skipped.join(', ')}.`,
    typeName: 'StateId',
    constName: 'STATES_OUTLINE',
    label: 'Outline map of the fifty states',
    list: STATES,
    shapes,
  });
}

/* ---------------------------------------------------------------------------
 * The bonus: DC and the five inhabited territories
 * ------------------------------------------------------------------------- */

/**
 * The coarser Census scale that carries all six. The 1:20,000,000 file the
 * states use carries DC and Puerto Rico and none of the other four; the
 * 1:5,000,000 carries every one.
 */
const BONUS_SCALE = '5m';

/**
 * The tile frame, in units. Six squares in `BONUS` order, two to a row, so a
 * name fits on a line at a size that still reads at 320px; under each square
 * a band for its name, two lines at most. The squares are large in units only
 * so whole-unit rounding is fine enough for an island a few kilometres
 * across: the stroke does not scale, and the panel sets the size on screen.
 */
const TILE = { size: 400, padding: 20, nameBand: 110, nameBaseline: 45, gap: 40, columns: 2 };

/**
 * When a tile's land is too little to find, and how it is found instead. A
 * tile whose drawn land covers less than `share` of its square is ringed: each
 * island group in it, pieces within `gap` units of one another, gets a circle
 * `clearance` units clear of its land. The three that fill their tiles cover
 * 23–28% (Guam, DC) and 8.9% (Puerto Rico); the scattered three 0.8–4.9%, so
 * the threshold sits between Puerto Rico and the Virgin Islands, near their
 * geometric mean. The gap is measured the same way: in the 2025 file the
 * pieces of one group are at most 22 units apart (Ofu-Olosega to Ta'u) and
 * two groups at least 196 (Tinian's to Rota). A ring stays `inset` inside its
 * square, clear of the square's own stroke; where one would not, the tile is
 * refitted to its rings rather than its land.
 */
const SCATTERED = { share: 0.065, gap: 60, clearance: 10, inset: 6 };

/** Mean Earth radius in km, to state each tile's scale in the header. */
const EARTH_RADIUS_KM = 6371;

/**
 * Places a tile draws only part of, and why. The repeated fit cannot help the
 * Northern Marianas: the chain runs 500 km from Rota to Agrihan with no piece
 * much larger than another, so fitted whole, Saipan is five pixels across and
 * the tile reads as empty. It is drawn as its three southern islands, where
 * nearly all its people live, with the islets beside them that survive the
 * fit, and the panel says what is missing. A ring is
 * left out when every point of it is north of `northOf`.
 */
const PARTIAL = [
  {
    place: 'MP',
    northOf: 15.5,
    note: 'drawn as its southern islands, Saipan, Tinian and Rota, without the Northern Islands beyond them',
  },
];

async function buildBonus() {
  const name = `cb_${CENSUS_VINTAGE}_us_state_${BONUS_SCALE}`;
  const source = `https://www2.census.gov/geo/tiger/GENZ${CENSUS_VINTAGE}/shp/${name}.zip`;
  const { polygons, rows } = await fetchShapefile(source, name);

  const cell = TILE.size + TILE.nameBand;
  const rowCount = Math.ceil(BONUS.length / TILE.columns);
  const frame = {
    width: TILE.columns * TILE.size + (TILE.columns - 1) * TILE.gap,
    height: rowCount * cell + (rowCount - 1) * TILE.gap,
  };

  const shapes = new Map();
  const tiles = [];
  const notes = [];
  const caught = [];
  const percent = (share) => `${(share * 100).toFixed(1)}%`;
  BONUS.forEach((place, i) => {
    const row = rows.findIndex((candidate) => candidate.STUSPS === place.id);
    if (row === -1) throw new Error(`${name} has no ${place.id} (${place.name})`);
    const partial = PARTIAL.find((candidate) => candidate.place === place.id);
    const rings = polygons[row].filter(
      (ring) => !partial || !ring.every(([, lat]) => lat > partial.northOf)
    );
    const cut = polygons[row].length - rings.length;

    const x = (i % TILE.columns) * (TILE.size + TILE.gap);
    const y = Math.floor(i / TILE.columns) * (cell + TILE.gap);
    const fit = fitTile(
      rings,
      localEqualArea(rings),
      { x, y, size: TILE.size, padding: TILE.padding },
      MIN_AREA
    );
    let d = pathData(fit.rings, fit.project, ROUGHENING);
    if (!d) throw new Error(`${place.id} has no drawable shape even filling its own tile`);

    // The share is judged on the land fitted to its square, so refitting to
    // the rings below cannot change which tiles are caught.
    const land = ringsOfPath(d).reduce((sum, ring) => sum + ringArea(ring), 0);
    const share = land / TILE.size ** 2;
    let scale = fit.scale;
    let circles;
    if (share < SCATTERED.share) {
      // A ring round a wide group reaches far past it above and below, so
      // a group against an edge rings out of its square. Then the drawing
      // is refitted to the rings rather than the land: shrunk about the
      // rings' bounds and centred, until every ring is inside. A few passes,
      // because the clearance does not shrink and rounding moves a unit.
      let project = fit.project;
      let shrunk = 1;
      for (let pass = 0; ; pass += 1) {
        circles = islandGroups(ringsOfPath(d), SCATTERED.gap).map((group) =>
          circleAround(group.flat(), SCATTERED.clearance)
        );
        const b = {
          left: Math.min(...circles.map(({ cx, r }) => cx - r)),
          top: Math.min(...circles.map(({ cy, r }) => cy - r)),
          right: Math.max(...circles.map(({ cx, r }) => cx + r)),
          bottom: Math.max(...circles.map(({ cy, r }) => cy + r)),
        };
        const [low, high] = [SCATTERED.inset, TILE.size - SCATTERED.inset];
        if (b.left >= x + low && b.right <= x + high && b.top >= y + low && b.bottom <= y + high) {
          break;
        }
        if (pass === 10) throw new Error(`${place.id}'s rings do not settle inside its tile`);
        const room = high - low;
        const k = Math.min(1, room / (b.right - b.left), room / (b.bottom - b.top));
        const [fromX, fromY] = [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
        const [toX, toY] = [x + TILE.size / 2, y + TILE.size / 2];
        const previous = project;
        project = (point) => {
          const [px, py] = previous(point);
          return [toX + k * (px - fromX), toY + k * (py - fromY)];
        };
        shrunk *= k;
        d = pathData(fit.rings, project, ROUGHENING);
      }
      scale *= shrunk;
      caught.push(
        `${place.id} at ${percent(share)}, ${circles.length} group${circles.length === 1 ? '' : 's'}` +
          (shrunk === 1 ? '' : `, drawn at ${percent(shrunk)} of its fit so they are inside`)
      );
    }

    shapes.set(place.id, d);
    tiles.push({
      id: place.id,
      x,
      y,
      size: TILE.size,
      name: { x: x + TILE.size / 2, y: y + TILE.size + TILE.nameBaseline },
      ...(partial ? { partial: partial.note } : {}),
      ...(circles ? { circles } : {}),
    });

    const drawn = d.split('M').length - 1;
    const total = polygons[row].length;
    const across = (TILE.size * EARTH_RADIUS_KM) / scale;
    notes.push(
      `${place.id} ${across < 100 ? across.toFixed(1) : Math.round(across)} km, ` +
        `${percent(share)} land, ` +
        `${drawn} of ${total} piece${total === 1 ? '' : 's'} drawn` +
        (partial ? ` (${cut} north of ${partial.northOf}° left out first: ${partial.note})` : '')
    );
  });

  await writeOutline({
    file: 'bonus.outline.ts',
    header: `
DC and the five inhabited territories, one tile each. GENERATED by \`npm run outline:build\`
(\`scripts/build-outline.mjs\`) — edit the script, not this file.

Source: US Census Bureau, ${CENSUS_VINTAGE} cartographic boundary file, states,
1:5,000,000 (\`${name}\`), a work of the US government and so in the
public domain. ${source}
Fetched ${today()}. The 1:20,000,000 file the states are drawn from carries
DC and PR only; this is the coarsest scale that carries all six.

Small multiples, not one map: each place is projected in its own Albers
equal-area conic, standard parallels a sixth in from the edges of its
latitude, and scaled to fill its tile. The tiles are NOT drawn to a common
scale, and the panel says so. Fitted to every piece, a speck sets the scale,
so the fit repeats: pieces under ${MIN_AREA} square units at the current scale are dropped
and the tile refitted to what is left, until nothing changes. The largest
piece always stays. Then simplified to ${TOLERANCE} units and rounded to whole units, as
the states are. Drawn in part, because no fit could show the whole and still
show anything: ${PARTIAL.map((p) => `${p.place}, ${p.note}`).join('; ')}. The panel says so.

Tile frame: ${frame.width} × ${frame.height} units, ${BONUS.length} squares of ${TILE.size} in \`BONUS\` order,
${TILE.columns} to a row, ${TILE.gap} apart, the land inset ${TILE.padding} from each edge, and a band of
${TILE.nameBand} under each square for its name. Each tile's width on the ground, how much
of its square is land, and how much of its place it draws: ${notes.join('; ')}.

Ringed where the land is too little to find: a tile whose land covers less than
${percent(SCATTERED.share)} of its square gets a circle round each island group, pieces within
${SCATTERED.gap} units of one another, ${SCATTERED.clearance} units clear of the land and at least ${SCATTERED.inset} inside the
square. The panel strokes a ring in its place's fill, only while that fill is
a mark. Caught today: ${caught.length > 0 ? caught.join('; ') : 'none'}.`,
    typeName: 'BonusId',
    constName: 'BONUS_OUTLINE',
    label: 'Outline maps of the District of Columbia and the five inhabited territories',
    list: BONUS,
    shapes,
    viewBox: `0 0 ${frame.width} ${frame.height}`,
    tiles,
  });
}

/* ---------------------------------------------------------------------------
 * The world: Natural Earth, for both world outlines
 * ------------------------------------------------------------------------- */

const NATURAL_EARTH = 'ne_110m_admin_0_countries';
const NATURAL_EARTH_SOURCE = `https://naciscdn.org/naturalearth/110m/cultural/${NATURAL_EARTH}.zip`;

/** Natural Earth's countries at 1:110m, and the version the zip says it is. */
async function fetchNaturalEarth() {
  const { polygons, rows, extra } = await fetchShapefile(NATURAL_EARTH_SOURCE, NATURAL_EARTH, [
    '.VERSION.txt',
  ]);
  return { polygons, rows, version: extra['.VERSION.txt'].trim() };
}

/**
 * The globe's edge in `project`, the ground every Equal Earth outline draws
 * its places on, so the projection's shape and the sea inside it show. Given
 * `clip`, an inset's frame, it is cut there, which inside the globe is the
 * frame itself. The states get none: Albers USA is three projections in one
 * frame, and has no globe to outline.
 */
const sphereOf = (project, clip) =>
  pathData([sphereRing()], project, { ...SPHERE_ROUGHENING, clip });

/** Both world outlines cite the same file the same way. */
function naturalEarthCitation(version) {
  return `Source: Natural Earth, 1:110m Admin 0 – Countries, version ${version}
(\`${NATURAL_EARTH}\`), which Natural Earth places in the public domain. ${NATURAL_EARTH_SOURCE}
Fetched ${today()}.`;
}

/* ---------------------------------------------------------------------------
 * The seven continents
 * ------------------------------------------------------------------------- */

/**
 * Countries that sit on two continents, and the one Natural Earth draws each
 * on. Named so the header can say so, rather than so the script can change it.
 */
const TRANSCONTINENTAL = ['RUS', 'TUR', 'EGY', 'KAZ'];

/**
 * Overseas pieces of a country that Natural Earth's 1:110m file keeps inside
 * the country's own shape, and so inside its continent. France is the one it
 * matters for at this scale: French Guiana would otherwise be a piece of
 * Europe on the coast of South America. A ring is moved when every point of
 * it is west of `westOf`.
 */
const OVERSEAS = [{ country: 'FRA', westOf: -30, continent: 'SA', name: 'French Guiana' }];

async function buildContinents() {
  const name = NATURAL_EARTH;
  const { polygons, rows, version } = await fetchNaturalEarth();
  const project = equalEarthWorld();
  const idFor = new Map(CONTINENTS.map((continent) => [continent.name, continent.id]));

  const rings = new Map(CONTINENTS.map((continent) => [continent.id, []]));
  const skipped = [];
  rows.forEach((row, i) => {
    const home = idFor.get(row.CONTINENT);
    if (!home) {
      skipped.push(`${row.ADMIN}, which Natural Earth files under "${row.CONTINENT}"`);
      return;
    }
    for (const ring of polygons[i]) {
      const away = OVERSEAS.find(
        (overseas) =>
          overseas.country === row.ADM0_A3 && ring.every(([lon]) => lon < overseas.westOf)
      );
      rings.get(away ? away.continent : home).push(ring);
    }
  });

  const shapes = new Map();
  for (const [id, list] of rings) {
    shapes.set(id, pathData(dissolve(list), project, ROUGHENING));
  }
  const missing = CONTINENTS.filter((continent) => !shapes.get(continent.id));
  if (missing.length > 0) {
    throw new Error(`${name} has no drawable shape for ${missing.map((c) => c.name).join(', ')}`);
  }

  const moved = OVERSEAS.map((overseas) => {
    const row = rows.find((candidate) => candidate.ADM0_A3 === overseas.country);
    const to = CONTINENTS.find((continent) => continent.id === overseas.continent);
    return `${overseas.name} is part of ${row.ADMIN}'s shape at this scale, and is drawn in ${to.name} rather than ${row.CONTINENT}.`;
  });
  const sides = TRANSCONTINENTAL.map((a3) => {
    const row = rows.find((candidate) => candidate.ADM0_A3 === a3);
    if (!row) throw new Error(`${name} has no ${a3}`);
    return `${row.ADMIN} in ${row.CONTINENT}`;
  });

  await writeOutline({
    file: 'continents.outline.ts',
    header: `
The seven continents, outlined. GENERATED by \`npm run outline:build\`
(\`scripts/build-outline.mjs\`) — edit the script, not this file.

${naturalEarthCitation(version)}

There is no authoritative boundary set for the seven-continent model, so
each continent is Natural Earth's countries dissolved by its \`CONTINENT\`
field, and a country is drawn wholly on one side. That is a drawing choice
and nothing more: progress is never derived from countries (see
\`places.data.ts\`). The transcontinental countries fall as ${sides.join(', ')}.
${moved.join(' ')}
New Guinea is split along its border, Indonesia's half in Asia and Papua New
Guinea's in Oceania. Left out: ${skipped.join('; ')}.

Projected in Equal Earth, 960 units from antimeridian to antimeridian, and
drawn on the globe's edge, \`sphere\`, so the frame is the whole globe rather
than a crop to the land; simplified to ${TOLERANCE} units, rounded to whole units,
islands under ${MIN_AREA} square units dropped. The edge is simplified to
${SPHERE_ROUGHENING.tolerance}, so no coast pokes past it by more than the rounding of the two.`,
    typeName: 'ContinentId',
    constName: 'CONTINENTS_OUTLINE',
    label: 'Outline map of the seven continents',
    list: CONTINENTS,
    shapes,
    sphere: sphereOf(project),
  });
}

/* ---------------------------------------------------------------------------
 * The 195 countries
 * ------------------------------------------------------------------------- */

/**
 * Where the countries the 1:110m file cannot draw are put: Natural Earth's
 * countries at 1:50m, which carries all of them. Its tiny-countries points
 * were the first choice and fall short, 16 of the 29 at 1:110m and 28 at
 * 1:50m, Cape Verde in neither. Read for `LABEL_X`/`LABEL_Y`, the point
 * Natural Earth sets a country's name on, which matches the tiny-countries
 * file wherever that has the country. Not the tiny-countries point itself:
 * that puts the Seychelles on Aldabra, a thousand kilometres from Mahé.
 */
const NATURAL_EARTH_50M = 'ne_50m_admin_0_countries';
const NATURAL_EARTH_50M_SOURCE = `https://naciscdn.org/naturalearth/50m/cultural/${NATURAL_EARTH_50M}.zip`;

/**
 * A dot's radius in frame units, the same for every country it draws, so a
 * dot says where a country is and nothing about its size. 10 is about 21px
 * across at the 64rem the world map widens to on a desktop, 16px at the
 * panel's 48rem and 6px at 320px. The 24px of WCAG 2.5.8 at
 * 320px would be 43 units, a dot 90px across on a desktop, and dots that size
 * buried 54 drawn countries, France, Germany, Italy and Spain among them; at
 * 14 they still hid 11, Palestine's alone covering Israel, Jordan, Lebanon and
 * Cyprus. The map is not where 2.5.8 is met: every country's checkbox below
 * it is, which is the criterion's equivalent-control exception, and why
 * nothing on the map takes focus. The insets are where crowding is solved,
 * not this. They use the same radius in frames of nearly the same width, so a
 * dot is one size on every map.
 */
const DOT_RADIUS = 10;

/**
 * The box Europe's inset enlarges, in degrees: Iceland to Moscow, Crete and
 * Cyprus to the North Cape. Its edges are cut through Greenland, North Africa,
 * Russia and the Levant, which the inset draws as far as the frame and no
 * further; the world map above it carries the rest.
 */
const EUROPE = { west: -25, east: 45, south: 34, north: 72 };

/**
 * The box the Caribbean's inset enlarges: Central America to Barbados, the
 * Bahamas to Trinidad and the Panama isthmus. Its edges are cut through
 * Mexico, Colombia and Venezuela, drawn as far as the frame, as Europe's are.
 */
const CARIBBEAN = { west: -90, east: -59, south: 9, north: 27 };

/**
 * The regions the world map is drawn again for, larger, one under another in
 * this order, each by the same code: `buildInset` draws it and `dotCosts`
 * judges it, and each writes its own outline with its own `enlarges`
 * rectangle on the world map.
 *
 * `scale` is how many times the world map's scale an inset is drawn at. A
 * whole number, so the rectangle on the world map and the inset's frame are
 * exactly one shape at two sizes. Europe's is 6, 173 × 100 units on the world
 * map and 1038 × 600 in its inset, where Luxembourg is about 17px across at
 * 64rem and on the world map is a dot over Belgium. Every later inset takes
 * the whole number that brings its frame nearest Europe's width, since the
 * insets are drawn at one width and a dot of `DOT_RADIUS` should be one size
 * on all of them: the Caribbean's 12 makes 90 × 64 units 1080 × 768, where 11
 * would make them 990 × 704. `title` starts a sentence on the panel and `name`
 * sits inside one.
 */
const INSETS = [
  {
    file: 'europe.outline.ts',
    constName: 'EUROPE_OUTLINE',
    title: 'Europe',
    name: 'Europe',
    region: EUROPE,
    scale: 6,
  },
  {
    file: 'caribbean.outline.ts',
    constName: 'CARIBBEAN_OUTLINE',
    title: 'The Caribbean',
    name: 'the Caribbean',
    region: CARIBBEAN,
    scale: 12,
  },
];

/**
 * The measurement that decides whether a region needs an inset. A country is
 * too small to aim at when it is drawn narrower than `NARROW_PX` with the map
 * `MEASURE_PX` wide: the 288px a 320px screen leaves inside the page's
 * padding. Every dot is, since a dot is 20 units across. Taken on the world
 * map over each inset's box, and on the inset itself at the same width, to say
 * how many it still leaves too small.
 *
 * The counts are printed in the countries outline's header each build. On
 * 2026-11-01 they were 43 in Europe, which had an inset, and 17 in the
 * Caribbean, which did not yet, and the decision taken on them was that the
 * Caribbean needed one too. 17 is under half of Europe's count, but the box is
 * a third of Europe's area on the map (5,760 square units to 17,300), so its
 * narrow countries are packed a fifth more densely than Europe's; and what
 * the Caribbean's 17 cost was the cost Europe's did, seven dots overlapping
 * and Trinidad and Tobago hidden under three of them, which the panel's note
 * had to name. The width is fixed at 320px, so giving the map more room on a
 * desktop changes no count.
 */
const MEASURE_PX = 288;
const NARROW_PX = 8;

/** A box of degrees as the headers write it: "25°W–45°E, 34°N–72°N". */
const degrees = ({ west, east, south, north }) =>
  `${Math.abs(west)}°${west < 0 ? 'W' : 'E'}–${Math.abs(east)}°${east < 0 ? 'W' : 'E'}, ` +
  `${south}°N–${north}°N`;

/** `names` as prose: "A", "A and B", "A, B and C". */
function listed(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * What drawing some places as dots costs on one map: the dots that touch,
 * gathered into the groups they chain into, each a list of ids in `dots`
 * order; and the drawn countries every point of which is under a dot, with
 * the dots that hide them.
 */
function dotCosts(dots, shapes) {
  const groups = dots.map((dot) => [dot]);
  for (const one of dots) {
    for (const two of dots) {
      const [a, b] = [groups.find((g) => g.includes(one)), groups.find((g) => g.includes(two))];
      if (a !== b && Math.hypot(one.x - two.x, one.y - two.y) < 2 * DOT_RADIUS) {
        a.push(...b);
        groups.splice(groups.indexOf(b), 1);
      }
    }
  }
  const crowded = groups
    .filter((group) => group.length > 1)
    .map((group) => dots.filter((dot) => group.includes(dot)).map((dot) => dot.id))
    .sort(
      (one, two) =>
        dots.findIndex((dot) => dot.id === one[0]) - dots.findIndex((dot) => dot.id === two[0])
    );

  const dotted = new Set(dots.map((dot) => dot.id));
  const under = (x, y) =>
    dots.filter((dot) => Math.hypot(x - dot.x, y - dot.y) <= DOT_RADIUS).map((dot) => dot.id);
  const covered = COUNTRIES.filter((country) => shapes.get(country.id) && !dotted.has(country.id))
    .map((country) => {
      const points = [...shapes.get(country.id).matchAll(/(-?\d+) (-?\d+)/g)].map(([, x, y]) =>
        under(Number(x), Number(y))
      );
      if (points.some((ids) => ids.length === 0)) return null;
      const by = dots.filter((dot) => points.some((ids) => ids.includes(dot.id)));
      return { id: country.id, by: by.map((dot) => dot.id) };
    })
    .filter(Boolean);
  return { crowded, covered };
}

/** A place's drawn width in frame units: a shape's extent, or a dot's diameter. */
function widthOf(d) {
  const xs = [...d.matchAll(/[ML](-?\d+) /g)].map(([, x]) => Number(x));
  return d.includes('A') ? 2 * DOT_RADIUS : Math.max(...xs) - Math.min(...xs);
}

/** A shape's drawn height in frame units. */
function heightOf(d) {
  const ys = [...d.matchAll(/[ML]-?\d+ (-?\d+)/g)].map(([, y]) => Number(y));
  return Math.max(...ys) - Math.min(...ys);
}

/**
 * Whether a shape would fit inside a dot. The inset exists to be aimed at,
 * and a dot is the smallest target either map offers, so there a shape this
 * small is drawn as the dot instead: Malta drawn true was three pixels across
 * at 48rem, smaller than the dot it had been on the world map.
 */
const fitsInDot = (d) => widthOf(d) < 2 * DOT_RADIUS && heightOf(d) < 2 * DOT_RADIUS;

/** Whether a projected point lies inside a rectangle of `projectedBounds`. */
const within = ([x, y], box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/**
 * One of `INSETS` drawn: its box on the world map, `scale` times larger, from
 * the 1:50m file, since at this scale the 1:110m borders would show their
 * corners, and it has no Andorra or Malta to draw. Every ring is cut to the
 * frame, so Russia is drawn as far as Europe's box and no further; a country
 * with nothing left inside it is not in the inset, and one too small for a
 * shape there, or small enough to fit inside a dot, is a dot.
 */
function buildInset({ region, scale }, { project, roughening, wanted, labels, polygons50m }) {
  const box = projectedBounds(project, region);
  const frame = {
    left: 0,
    top: 0,
    right: (box.right - box.left) * scale,
    bottom: (box.bottom - box.top) * scale,
  };
  const insetProject = (point) => {
    const [x, y] = project(point);
    return [(x - box.left) * scale, (y - box.top) * scale];
  };
  const clipped = { ...roughening, clip: frame };
  const shapes = new Map();
  const centres = new Map();
  const unkeyed = [];
  const unkeyedNames = [];
  labels.forEach((row, i) => {
    const id = row.ISO_A2_EH;
    const d = pathData(polygons50m[i], insetProject, clipped);
    if (!wanted.has(id)) {
      if (d) {
        unkeyed.push(d);
        unkeyedNames.push(row.ADMIN);
      }
      return;
    }
    if (shapes.has(id) || centres.has(id)) {
      throw new Error(`${NATURAL_EARTH_50M} has two shapes for ${id}`);
    }
    const label = insetProject([Number(row.LABEL_X), Number(row.LABEL_Y)]);
    if (d && !fitsInDot(d)) shapes.set(id, d);
    else if (within(label, frame)) centres.set(id, label);
  });
  // A dot is moved in from the frame's edge until it is whole, so the frame
  // never cuts a target in half: Lebanon's label point sits on Europe's edge.
  const clamp = (value, high) => Math.min(Math.max(value, DOT_RADIUS), high - DOT_RADIUS);
  const dots = COUNTRIES.filter((country) => centres.has(country.id)).map((country) => {
    const [cx, cy] = centres.get(country.id).map(Math.round);
    const [x, y] = [clamp(cx, frame.right), clamp(cy, frame.bottom)];
    shapes.set(country.id, dotData([x, y], DOT_RADIUS));
    return { id: country.id, x, y };
  });
  return {
    box,
    frame,
    shapes,
    dotted: new Set(centres.keys()),
    dots,
    costs: dotCosts(dots, shapes),
    unkeyed: unkeyed.join(''),
    unkeyedNames,
    sphere: sphereOf(insetProject, frame),
  };
}

async function buildCountries() {
  const { polygons, rows, version } = await fetchNaturalEarth();
  const project = equalEarthWorld();
  const roughening = { tolerance: TOLERANCE, minArea: COUNTRY_MIN_AREA };
  const wanted = new Set(COUNTRIES.map((country) => country.id));

  // `ISO_A2_EH`, not `ISO_A2`: in 5.1.1 the plain field is -99 for France and
  // Norway, and a join on it loses both without a word.
  const shapes = new Map();
  const unkeyedRings = [];
  const unkeyedNames = [];
  rows.forEach((row, i) => {
    const id = row.ISO_A2_EH;
    if (!wanted.has(id)) {
      unkeyedRings.push(...polygons[i]);
      unkeyedNames.push(row.ADMIN);
      return;
    }
    if (shapes.has(id)) throw new Error(`${NATURAL_EARTH} has two shapes for ${id}`);
    shapes.set(id, pathData(polygons[i], project, roughening));
  });

  const absent = COUNTRIES.filter((country) => !shapes.has(country.id));
  const roughened = COUNTRIES.filter(
    (country) => shapes.has(country.id) && !shapes.get(country.id)
  );
  const named = (list) => list.map((country) => country.id).join(', ');
  const nameOf = new Map(COUNTRIES.map((country) => [country.id, country.name]));

  // Every undrawn country becomes a dot, at a whole-unit centre so the
  // overlaps below are measured on what is drawn.
  const file50m = await fetchZip(NATURAL_EARTH_50M_SOURCE, NATURAL_EARTH_50M);
  const version50m = file50m('.VERSION.txt').toString('utf8').trim();
  const labels = readTable(file50m('.dbf'));
  const centres = new Map();
  for (const country of absent) {
    const row = labels.find((candidate) => candidate.ISO_A2_EH === country.id);
    if (!row) throw new Error(`${NATURAL_EARTH_50M} has no ${country.id} (${country.name})`);
    centres.set(country.id, project([Number(row.LABEL_X), Number(row.LABEL_Y)]));
  }
  for (const country of roughened) {
    const i = rows.findIndex((candidate) => candidate.ISO_A2_EH === country.id);
    centres.set(country.id, centroid(polygons[i].map((ring) => ring.map(project))));
  }
  const dots = COUNTRIES.filter((country) => centres.has(country.id)).map((country) => {
    const [x, y] = centres.get(country.id).map(Math.round);
    shapes.set(country.id, dotData([x, y], DOT_RADIUS));
    return { id: country.id, x, y };
  });

  const unkeyed = pathData(unkeyedRings, project, roughening);
  const sphere = sphereOf(project);
  const viewBox = viewBoxOf([...shapes.values(), unkeyed, sphere], MARGIN);

  // Each inset, drawn by one code path. A later inset's scale is held to the
  // rule `INSETS` states, so a region added with a guessed scale stops here.
  const polygons50m = readPolygons(file50m('.shp'));
  const context = { project, roughening, wanted, labels, polygons50m };
  const insets = INSETS.map((spec) => ({ ...spec, ...buildInset(spec, context) }));
  const [first] = insets;
  for (const inset of insets.slice(1)) {
    const nearest = Math.round(first.frame.right / (inset.box.right - inset.box.left));
    if (inset.scale !== nearest) {
      throw new Error(
        `${inset.name}'s inset is at ${inset.scale} times the world map's scale; ` +
          `${nearest} brings its frame nearest ${first.name}'s width`
      );
    }
  }

  // What the dots cost on each map. A country the world map crowds or hides
  // is left out of its note when an inset draws it clear of every dot,
  // because there it can be seen and aimed at; an inset's own costs, if it
  // has any, are said too.
  const world = dotCosts(dots, shapes);
  const apartIn = (inset) => {
    const troubled = new Set([
      ...inset.costs.crowded.flat(),
      ...inset.costs.covered.map(({ id }) => id),
    ]);
    return (id) => inset.shapes.has(id) && !troubled.has(id);
  };
  const apart = (id) => insets.some((inset) => apartIn(inset)(id));
  const crowdedText = (groups) =>
    groups.map((group) => listed(group.map((id) => nameOf.get(id)))).join('; ');
  const coveredText = (list) =>
    list
      .map(({ id, by }) => `${nameOf.get(id)}, under ${listed(by.map((dot) => nameOf.get(dot)))}`)
      .join('; ');
  const worldCrowded = world.crowded.filter((group) => !group.every(apart));
  const worldCovered = world.covered.filter(({ id }) => !apart(id));
  const troubledOnWorld = [...world.crowded.flat(), ...world.covered.map(({ id }) => id)];

  const insetNotes = insets.flatMap((inset) => {
    const enlarged = new Set(troubledOnWorld.filter(apartIn(inset)));
    const { crowded, covered } = inset.costs;
    return [
      enlarged.size > 0
        ? `${inset.title} is drawn again below at ${inset.scale} times the scale, where the ` +
          `${enlarged.size} of its countries the dots crowd or hide here stand clear of each other.`
        : '',
      crowded.length > 0
        ? `Below, in ${inset.name}, dots overlap for ${crowdedText(crowded)}.`
        : '',
      covered.length > 0 ? `Below, in ${inset.name}, dots hide ${coveredText(covered)}.` : '',
    ];
  });
  const note = [
    `${dots.length} countries too small to draw at this scale are dots, all one size whatever the country's.`,
    worldCrowded.length > 0 ? `Dots overlap for ${crowdedText(worldCrowded)}.` : '',
    worldCovered.length > 0 ? `Dots hide a whole country: ${coveredText(worldCovered)}.` : '',
    ...insetNotes,
    'Every country can be ticked in the list.',
  ]
    .filter(Boolean)
    .join(' ');

  // The measurement: see `MEASURE_PX`.
  const pxPerUnit = MEASURE_PX / Number(viewBox.split(' ')[2]);
  const labelOf = new Map(
    labels.map((row) => [row.ISO_A2_EH, [Number(row.LABEL_X), Number(row.LABEL_Y)]])
  );
  const inBox = (id, { west, east, south, north }) => {
    const [lon, lat] = labelOf.get(id);
    return lon >= west && lon <= east && lat >= south && lat <= north;
  };
  const narrow = COUNTRIES.filter(
    (country) => widthOf(shapes.get(country.id)) * pxPerUnit < NARROW_PX
  );
  // Per inset: the countries in its region the world map draws too narrow,
  // and of those, the ones its own drawing still does at the same width.
  const measured = insets.map((inset) => {
    const pxPerInsetUnit = MEASURE_PX / (inset.frame.right + 2 * MARGIN);
    const narrowHere = narrow.filter((country) => inBox(country.id, inset.region));
    const stillNarrow = narrowHere.filter(
      (country) =>
        !inset.shapes.has(country.id) ||
        widthOf(inset.shapes.get(country.id)) * pxPerInsetUnit < NARROW_PX
    );
    return { ...inset, narrow: narrowHere, stillNarrow };
  });

  await writeOutline({
    file: 'countries.outline.ts',
    header: `
The ${COUNTRIES.length} countries, outlined. GENERATED by \`npm run outline:build\`
(\`scripts/build-outline.mjs\`) — edit the script, not this file.

${naturalEarthCitation(version)}

Joined on \`ISO_A2_EH\`, the code \`places.data.ts\` keys countries by. ${COUNTRIES.length - absent.length - roughened.length}
of the ${COUNTRIES.length} are drawn as shapes. ${absent.length} are not in the file at this scale: ${named(absent)}.
${roughened.length} are, but are smaller than a triangle once roughened: ${named(roughened)}.

Those ${dots.length} are drawn as dots of radius ${DOT_RADIUS} units, after every shape so they paint
over them. The ${absent.length} sit at the label point of Natural Earth, 1:50m Admin 0 –
Countries, version ${version50m} (\`${NATURAL_EARTH_50M}\`), also in the public domain.
${NATURAL_EARTH_50M_SOURCE} Fetched ${today()}.
The ${roughened.length} sit at the area-weighted centroid of their own 1:110m polygon. Where
dots overlap or hide a country, the panel says which, in \`note\`.

Land that is none of the ${COUNTRIES.length} is drawn unkeyed, as one path, so the coastline
is whole without the count changing: ${unkeyedNames.join(', ')}.

Projected in Equal Earth, 960 units from antimeridian to antimeridian, and
drawn on the globe's edge, \`sphere\`, as the continents are; simplified to ${TOLERANCE} units,
rounded to whole units, islands under ${COUNTRY_MIN_AREA} square unit dropped.

Too small to aim at, measured: drawn narrower than ${NARROW_PX}px with this map ${MEASURE_PX}px wide,
the most a 320px screen leaves it, are ${narrow.length} countries. ${measured.length} regions are enlarged, each in an
inset of its own under this map: ${measured
      .map(
        (inset) =>
          `${inset.name} (${degrees(inset.region)}), where ${inset.narrow.length} of them are, which \`${inset.file}\` ` +
          `draws at ${inset.scale} times this scale`
      )
      .join('; ')}.`,
    typeName: 'CountryId',
    constName: 'COUNTRIES_OUTLINE',
    label: 'Outline map of the countries of the world',
    list: COUNTRIES,
    shapes,
    onTop: new Set(centres.keys()),
    note,
    unkeyed,
    viewBox,
    sphere,
  });

  for (const inset of measured) {
    await writeInset(inset, version50m);
  }
}

/** One inset's outline module, from what `buildInset` and the measurement made of it. */
async function writeInset(inset, version50m) {
  const { box, frame, shapes, dots, narrow, stillNarrow } = inset;
  const named = (list) => list.map((country) => country.id).join(', ');
  await writeOutline({
    file: inset.file,
    header: `
${inset.title}, enlarged from the countries outline. GENERATED by \`npm run outline:build\`
(\`scripts/build-outline.mjs\`, the \`countries\` target, since the world map's
note depends on it) — edit the script, not this file.

Source: Natural Earth, 1:50m Admin 0 – Countries, version ${version50m}
(\`${NATURAL_EARTH_50M}\`), which Natural Earth places in the public domain.
${NATURAL_EARTH_50M_SOURCE} Fetched ${today()}. The finer of the two Natural
Earth scales, because this map is drawn larger; joined on \`ISO_A2_EH\` as the
world map is, so a shape here is the same place as the shape of the same id there.

The box ${degrees(inset.region)} in the same Equal Earth projection as the world map,
at ${inset.scale} times its scale: ${frame.right} × ${frame.bottom} units here, and the rectangle
\`enlarges\`, ${box.right - box.left} × ${box.bottom - box.top} units at ${box.left}, ${box.top}, on the world map. Every ring is
cut to the frame, so the countries on its edges are drawn only as far as it.
Simplified to ${TOLERANCE} units, rounded to whole units, islands under ${COUNTRY_MIN_AREA} square unit dropped.

Of the ${narrow.length} countries in the box that the world map draws narrower than ${NARROW_PX}px
when ${MEASURE_PX}px wide, ${stillNarrow.length} still are here at the same width: ${named(stillNarrow) || 'none'}.

${shapes.size} countries are drawn, ${dots.length} of them as dots of radius ${DOT_RADIUS} units at Natural
Earth's label point, because even here they are smaller than a triangle or
would fit inside a dot, which is the smaller target:
${dots.map((dot) => dot.id).join(', ') || 'none'}. Land inside the frame that is none of the
${COUNTRIES.length} is drawn unkeyed: ${inset.unkeyedNames.join(', ') || 'none'}. The globe's edge,
\`sphere\`, is cut to the frame as everything else is, and inside the globe
that leaves the frame itself: the sea the countries sit on, as on the world map.`,
    typeName: 'CountryId',
    constName: inset.constName,
    label: `Outline map of ${inset.name}, enlarged`,
    list: COUNTRIES,
    shapes,
    onTop: inset.dotted,
    unkeyed: inset.unkeyed,
    viewBox: `${-MARGIN} ${-MARGIN} ${frame.right + 2 * MARGIN} ${frame.bottom + 2 * MARGIN}`,
    sphere: inset.sphere,
    enlarges: {
      x: box.left,
      y: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
    },
  });
}

/* ---------------------------------------------------------------------------
 * Running
 * ------------------------------------------------------------------------- */

const TARGETS = {
  states: buildStates,
  bonus: buildBonus,
  continents: buildContinents,
  countries: buildCountries,
};

async function main() {
  const asked = process.argv.slice(2);
  const unknown = asked.filter((target) => !(target in TARGETS));
  if (unknown.length > 0) {
    throw new Error(
      `no outline called ${unknown.join(', ')}; try ${Object.keys(TARGETS).join(', ')}`
    );
  }
  for (const target of asked.length > 0 ? asked : Object.keys(TARGETS)) {
    await TARGETS[target]();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
