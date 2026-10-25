/**
 * Builds `/wanderquest`'s map outlines from public-domain boundary files.
 *
 *     npm run outline:build                    # every outline
 *     npm run outline:build -- continents      # just the named ones
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
 * 960 units across so the outlines share a stroke weight. The spec holds each
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

import { CONTINENTS, STATES } from '../src/app/wanderquest/places.data.ts';
import {
  albersUsa,
  dissolve,
  equalEarthWorld,
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

/** A zipped shapefile's geometry and attribute table, and any other file asked for. */
async function fetchShapefile(source, name, extra = []) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${source} answered ${response.status}`);
  const files = unzip(Buffer.from(await response.arrayBuffer()));
  const file = (suffix) => {
    const found = files.get(`${name}${suffix}`);
    if (!found) throw new Error(`${name}.zip has no ${suffix}`);
    return found;
  };
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

/** Writes one outline module, formatted as the repo formats it. */
async function writeOutline({ file, header, typeName, constName, label, list, shapes }) {
  const output = path.join(outputDirectory, file);
  const entries = list.map((place) => `  { id: '${place.id}', d: '${shapes.get(place.id)}' },`);
  const source = `/**
${commentBody(header)}
 */
import type { ${typeName} } from './places.data';
import type { IOutline } from './outline';

export const ${constName}: IOutline<${typeName}> = {
  label: '${label}',
  viewBox: '${viewBoxOf([...shapes.values()], MARGIN)}',
  shapes: [
${entries.join('\n')}
  ],
};
`;
  const options = (await prettier.resolveConfig(output)) ?? {};
  await writeFile(output, await prettier.format(source, { ...options, filepath: output }));

  const bytes = [...shapes.values()].reduce((sum, d) => sum + d.length, 0);
  console.log(
    `Wrote ${path.relative(repoRoot, output)}: ${shapes.size} shapes, ${bytes} bytes of path data.`
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
  const name = 'ne_110m_admin_0_countries';
  const source = `https://naciscdn.org/naturalearth/110m/cultural/${name}.zip`;
  const { polygons, rows, extra } = await fetchShapefile(source, name, ['.VERSION.txt']);
  const version = extra['.VERSION.txt'].trim();
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

Source: Natural Earth, 1:110m Admin 0 – Countries, version ${version}
(\`${name}\`), which Natural Earth places in the public domain. ${source}
Fetched ${today()}.

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
 * Running
 * ------------------------------------------------------------------------- */

const TARGETS = { states: buildStates, continents: buildContinents };

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
