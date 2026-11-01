/**
 * Builds `/wanderquest`'s map outlines from public-domain boundary files.
 *
 *     npm run outline:build                    # every outline
 *     npm run outline:build -- continents      # just the named ones
 *
 * The targets are `states`, `bonus`, `continents` and `countries`.
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
  dissolve,
  dotData,
  equalEarthWorld,
  fitTile,
  localEqualArea,
  pathData,
  readPolygons,
  readTable,
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
}) {
  const output = path.join(outputDirectory, file);
  const last = (place) => (onTop?.has(place.id) ? 1 : 0);
  const entries = list
    .filter((place) => shapes.get(place.id))
    .sort((one, two) => last(one) - last(two))
    .map((place) => `  { id: '${place.id}', d: '${shapes.get(place.id)}' },`);
  const drawn = [...shapes.values(), ...(unkeyed ? [unkeyed] : [])].filter(Boolean);
  const tileEntries = (tiles ?? []).map(
    (tile) =>
      `  { id: '${tile.id}', x: ${tile.x}, y: ${tile.y}, size: ${tile.size}, name: { x: ${tile.name.x}, y: ${tile.name.y} }${tile.partial ? `, partial: '${tile.partial}'` : ''} },`
  );
  const source = `/**
${commentBody(header)}
 */
import type { ${typeName} } from './places.data';
import type { IOutline } from './outline';

export const ${constName}: IOutline<${typeName}> = {
  label: '${label}',
  viewBox: '${viewBox ?? viewBoxOf(drawn, MARGIN)}',
  shapes: [
${entries.join('\n')}
  ],${note ? `\n  note: ${JSON.stringify(note)},` : ''}${unkeyed ? `\n  unkeyed: '${unkeyed}',` : ''}${tiles ? `\n  tiles: [\n${tileEntries.join('\n')}\n  ],` : ''}
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
    const d = pathData(fit.rings, fit.project, ROUGHENING);
    if (!d) throw new Error(`${place.id} has no drawable shape even filling its own tile`);
    shapes.set(place.id, d);
    tiles.push({
      id: place.id,
      x,
      y,
      size: TILE.size,
      name: { x: x + TILE.size / 2, y: y + TILE.size + TILE.nameBaseline },
      ...(partial ? { partial: partial.note } : {}),
    });

    const drawn = d.split('M').length - 1;
    const total = polygons[row].length;
    const across = (TILE.size * EARTH_RADIUS_KM) / fit.scale;
    notes.push(
      `${place.id} ${across < 100 ? across.toFixed(1) : Math.round(across)} km, ` +
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
${TILE.nameBand} under each square for its name. Each tile's width on the ground, and how
much of its place it draws: ${notes.join('; ')}.`,
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

Projected in Equal Earth, 960 units from antimeridian to antimeridian, then
cropped to the shapes; simplified to ${TOLERANCE} units, rounded to whole units,
islands under ${MIN_AREA} square units dropped.`,
    typeName: 'ContinentId',
    constName: 'CONTINENTS_OUTLINE',
    label: 'Outline map of the seven continents',
    list: CONTINENTS,
    shapes,
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
 * dot says where a country is and nothing about its size. 10 is about 16px
 * across at the panel's 48rem and 6px at 320px. The 24px of WCAG 2.5.8 at
 * 320px would be 43 units, a dot 65px across on a desktop, and dots that size
 * buried 54 drawn countries, France, Germany, Italy and Spain among them; at
 * 14 they still hid 11, Palestine's alone covering Israel, Jordan, Lebanon and
 * Cyprus. The map is not where 2.5.8 is met: every country's checkbox below
 * it is, which is the criterion's equivalent-control exception, and why
 * nothing on the map takes focus. The Europe inset is where crowding is
 * solved, not this.
 */
const DOT_RADIUS = 10;

/** `names` as prose: "A", "A and B", "A, B and C". */
function listed(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
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

  // Dots that touch, gathered into the groups they chain into.
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
    .map((group) => dots.filter((dot) => group.includes(dot)))
    .sort((one, two) => dots.indexOf(one[0]) - dots.indexOf(two[0]))
    .map((group) => listed(group.map((dot) => nameOf.get(dot.id))));

  // Drawn countries every point of which is under a dot, and whose.
  const under = (x, y) =>
    dots.filter((dot) => Math.hypot(x - dot.x, y - dot.y) <= DOT_RADIUS).map((dot) => dot.id);
  const covered = COUNTRIES.filter((country) => shapes.get(country.id) && !centres.has(country.id))
    .map((country) => {
      const points = [...shapes.get(country.id).matchAll(/(-?\d+) (-?\d+)/g)].map(([, x, y]) =>
        under(Number(x), Number(y))
      );
      if (points.some((ids) => ids.length === 0)) return null;
      const by = dots.filter((dot) => points.some((ids) => ids.includes(dot.id)));
      return `${nameOf.get(country.id)}, under ${listed(by.map((dot) => nameOf.get(dot.id)))}`;
    })
    .filter(Boolean);

  const note = [
    `${dots.length} countries too small to draw at this scale are dots, all one size whatever the country's.`,
    crowded.length > 0 ? `Dots overlap for ${crowded.join('; ')}.` : '',
    covered.length > 0 ? `Dots hide a whole country: ${covered.join('; ')}.` : '',
    'Every country can be ticked in the list.',
  ]
    .filter(Boolean)
    .join(' ');

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

Projected in Equal Earth, 960 units from antimeridian to antimeridian, as the
continents are, then cropped to the shapes and dots; simplified to ${TOLERANCE} units, rounded
to whole units, islands under ${COUNTRY_MIN_AREA} square unit dropped.`,
    typeName: 'CountryId',
    constName: 'COUNTRIES_OUTLINE',
    label: 'Outline map of the countries of the world',
    list: COUNTRIES,
    shapes,
    onTop: new Set(centres.keys()),
    note,
    unkeyed: pathData(unkeyedRings, project, roughening),
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
