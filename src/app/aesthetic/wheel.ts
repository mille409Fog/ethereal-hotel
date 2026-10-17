import { IOklch, maxChroma, toHex } from './colour';

/**
 * The wheel: what every cell is, where it sits, and how a pointer or a key
 * finds one. Pure and Angular-free, so the specs can hold the geometry and the
 * colour without a DOM; `aesthetic.ts` only draws what this file decides.
 *
 * Three decisions carry the rest:
 *
 * - **The angle on the wheel is the OKLCH hue angle**, measured clockwise from
 *   twelve o'clock. No offset, no remapping: a cell at 42° *is* hue 42°, so
 *   the wheel can be read as a protractor, and the mechanism that later
 *   chooses a secondary and a tertiary can reason in degrees without a lookup.
 *   It puts rose rather than red at the top, which is what OKLCH's zero is.
 * - **Sixty hues, like the minutes of a clock face**, in six tones: 360 cells,
 *   each 6° wide. Finer than that and neighbours stop being distinguishable on
 *   a phone; coarser and the wheel stops reading as a continuum.
 * - **A ring is one OKLCH lightness.** Chroma is a share of the most that sRGB
 *   can show at that lightness and hue (`maxChroma`), so every cell is as vivid
 *   as the screen allows for its tone, softened toward the deepest and palest
 *   rings. That makes chroma vary around a ring, sometimes a lot (a light
 *   yellow can be far more saturated than a light blue), and that variation is
 *   the gamut's true shape, not a bug to flatten.
 *
 * The continuum ring outside the cells is the same function, `tone()` at the
 * `CONTINUUM_TONE`, sampled every `CONTINUUM_STEP` degrees instead of six. The
 * cells visibly quantise it, which is the point of showing both.
 */

/** One concentric ring of the wheel, innermost first. */
export interface ITone {
  /** Prefixed to the hue's name: "Deep vermilion". */
  readonly name: string;
  /** OKLCH lightness, shared by every cell in the ring. */
  readonly l: number;
  /** The fraction of `maxChroma(l, h)` each cell takes. */
  readonly chromaShare: number;
}

/**
 * Innermost to outermost: the wheel darkens toward its centre and pales toward
 * its rim. The shares fall off at both ends so the deep ring reads as shadow
 * rather than as neon on black, and the pale ring as a tint rather than a
 * highlighter.
 */
export const TONES: readonly ITone[] = [
  { name: 'Deep', l: 0.38, chromaShare: 0.88 },
  { name: 'Dark', l: 0.49, chromaShare: 0.95 },
  { name: 'Rich', l: 0.6, chromaShare: 1 },
  { name: 'Bright', l: 0.71, chromaShare: 1 },
  { name: 'Light', l: 0.81, chromaShare: 0.88 },
  { name: 'Pale', l: 0.9, chromaShare: 0.72 },
];

export const HUE_COUNT = 60;
export const HUE_STEP = 360 / HUE_COUNT;

/** Cells per labelled sector: twelve sectors of 30°, like the hours. */
export const SECTOR_SIZE = 5;

/** The ring the continuum is drawn at. Bright, the most saturated overall. */
export const CONTINUUM_TONE = 3;

/** Degrees between the continuum's gradient stops. */
export const CONTINUUM_STEP = 2;

/**
 * Names, placed at the OKLCH hue of the colour they name, measured from its
 * sRGB definition (red is `#ff0000` at 29.2°, yellow `#ffff00` at 109.8°,
 * blue `#0000ff` at 264.1°). A cell takes the nearest. The anchors are spaced
 * so that no sector's centre (15° + 30k) is equidistant from two of them, which
 * would leave its label to the order of this list.
 */
export const HUE_NAMES: ReadonlyArray<{ readonly name: string; readonly h: number }> = [
  { name: 'Rose', h: 2 },
  { name: 'Crimson', h: 18 },
  { name: 'Red', h: 29 },
  { name: 'Vermilion', h: 41 },
  { name: 'Orange', h: 53 },
  { name: 'Apricot', h: 68 },
  { name: 'Amber', h: 84 },
  { name: 'Gold', h: 96 },
  { name: 'Yellow', h: 110 },
  { name: 'Citron', h: 123 },
  { name: 'Chartreuse', h: 136 },
  { name: 'Green', h: 146 },
  { name: 'Emerald', h: 158 },
  { name: 'Jade', h: 170 },
  { name: 'Cyan', h: 195 },
  { name: 'Cerulean', h: 218 },
  { name: 'Azure', h: 230 },
  { name: 'Cobalt', h: 250 },
  { name: 'Blue', h: 264 },
  { name: 'Ultramarine', h: 277 },
  { name: 'Violet', h: 294 },
  { name: 'Amethyst', h: 310 },
  { name: 'Magenta', h: 328 },
  { name: 'Cerise', h: 345 },
];

/** Shortest distance between two angles, in degrees, in [0, 180]. */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

/** The name of the anchor nearest this hue. */
export function hueName(h: number): string {
  let best = HUE_NAMES[0];
  for (const anchor of HUE_NAMES) {
    if (angularDistance(anchor.h, h) < angularDistance(best.h, h)) {
      best = anchor;
    }
  }
  return best.name;
}

/** The colour of a tone at any hue: the function the cells sample. */
export function tone(toneIndex: number, h: number): IOklch {
  const { l, chromaShare } = TONES[toneIndex];
  return { l, c: maxChroma(l, h) * chromaShare, h };
}

/** One region of the wheel, and the single colour it stands for. */
export interface ICell {
  /** Position in `CELLS`: `toneIndex * HUE_COUNT + hueIndex`. */
  readonly index: number;
  readonly hueIndex: number;
  readonly toneIndex: number;
  /** The hue at the cell's centre, which is the hue of its colour. */
  readonly h: number;
  readonly colour: IOklch;
  readonly hex: string;
  /** "Deep vermilion". */
  readonly name: string;
}

export function cellIndex(hueIndex: number, toneIndex: number): number {
  return toneIndex * HUE_COUNT + hueIndex;
}

export const CELLS: readonly ICell[] = TONES.flatMap((_, toneIndex) =>
  Array.from({ length: HUE_COUNT }, (__, hueIndex): ICell => {
    const h = (hueIndex + 0.5) * HUE_STEP;
    const colour = tone(toneIndex, h);
    return {
      index: cellIndex(hueIndex, toneIndex),
      hueIndex,
      toneIndex,
      h,
      colour,
      hex: toHex(colour),
      name: `${TONES[toneIndex].name} ${hueName(h).toLowerCase()}`,
    };
  })
);

/** `oklch(0.600 0.214 42.0)`, the form CSS accepts and the readout prints. */
export function oklchText({ l, c, h }: IOklch): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

// ----- Geometry -----
//
// In SVG user units, centred on the origin, with y pointing down. The view box
// is `-VIEW_RADIUS … VIEW_RADIUS` on both axes; the CSS masks for the
// continuum read the same numbers as percentages of it, so they live here once.

export const VIEW_RADIUS = 310;

export const RADII = {
  /** The glass medallion at the centre, which holds the primary. */
  medallion: 62,
  /** The filigree ring between the medallion and the cells. */
  filigreeInner: 70,
  filigreeOuter: 84,
  /** The cell field, divided evenly among the tones. */
  cellsInner: 92,
  cellsOuter: 222,
  /** The continuum, drawn in CSS behind the SVG. */
  continuumInner: 228,
  continuumOuter: 242,
  /** The gilt bezel and its ticks. */
  bezel: 248,
  minuteTick: 258,
  hourTick: 266,
  labels: 280,
  /** The slowly turning ring at the rim. */
  rete: 300,
} as const;

export const RING_WIDTH = (RADII.cellsOuter - RADII.cellsInner) / TONES.length;

/** A point at radius `r` and angle `deg`, clockwise from twelve o'clock. */
export function polar(r: number, deg: number): { x: number; y: number } {
  return { x: r * Math.sin(deg * (Math.PI / 180)), y: -r * Math.cos(deg * (Math.PI / 180)) };
}

const fixed = (n: number): string => (Math.abs(n) < 5e-3 ? '0' : n.toFixed(2));

/** An annular sector between two radii and two angles, as an SVG path. */
export function sectorPath(r0: number, r1: number, a0: number, a1: number): string {
  const outerStart = polar(r1, a0);
  const outerEnd = polar(r1, a1);
  const innerEnd = polar(r0, a1);
  const innerStart = polar(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return (
    `M${fixed(outerStart.x)} ${fixed(outerStart.y)}` +
    `A${r1} ${r1} 0 ${large} 1 ${fixed(outerEnd.x)} ${fixed(outerEnd.y)}` +
    `L${fixed(innerEnd.x)} ${fixed(innerEnd.y)}` +
    `A${r0} ${r0} 0 ${large} 0 ${fixed(innerStart.x)} ${fixed(innerStart.y)}Z`
  );
}

export function toneRadii(toneIndex: number): { inner: number; outer: number } {
  const inner = RADII.cellsInner + toneIndex * RING_WIDTH;
  return { inner, outer: inner + RING_WIDTH };
}

/** The cell's own outline, where it sits on the wheel. */
export function cellPath(cell: ICell): string {
  const { inner, outer } = toneRadii(cell.toneIndex);
  return sectorPath(inner, outer, cell.hueIndex * HUE_STEP, (cell.hueIndex + 1) * HUE_STEP);
}

/**
 * The same outline centred on twelve o'clock. A marker draws this and is then
 * rotated to the cell's hue, so moving a marker to a new hue is a rotation the
 * browser can animate rather than a path it would have to morph.
 */
export function markerPath(toneIndex: number): string {
  const { inner, outer } = toneRadii(toneIndex);
  return sectorPath(inner, outer, -HUE_STEP / 2, HUE_STEP / 2);
}

/** The angle of a point, clockwise from twelve o'clock, in [0, 360). */
export function angleOf(x: number, y: number): number {
  return ((((Math.atan2(x, -y) * 180) / Math.PI) % 360) + 360) % 360;
}

/**
 * The cell under a point in user units, or null outside the cells. The
 * continuum answers too, with the cell its hue falls in at `CONTINUUM_TONE`,
 * because a visitor who presses the band of pure colour has asked for that
 * colour and the nearest thing the wheel offers is that ring's cell.
 */
export function cellAt(x: number, y: number): ICell | null {
  const r = Math.hypot(x, y);
  const hueIndex = Math.min(HUE_COUNT - 1, Math.floor(angleOf(x, y) / HUE_STEP));
  if (r >= RADII.cellsInner && r < RADII.cellsOuter) {
    const toneIndex = Math.min(TONES.length - 1, Math.floor((r - RADII.cellsInner) / RING_WIDTH));
    return CELLS[cellIndex(hueIndex, toneIndex)];
  }
  if (r >= RADII.continuumInner && r < RADII.continuumOuter) {
    return CELLS[cellIndex(hueIndex, CONTINUUM_TONE)];
  }
  return null;
}

/** The centre of a cell, for drawing lines between chosen colours. */
export function cellCentre(cell: ICell): { x: number; y: number } {
  const { inner, outer } = toneRadii(cell.toneIndex);
  return polar((inner + outer) / 2, cell.h);
}

/**
 * Where a key moves focus from `cell`, or null for a key the wheel does not
 * use. Left and right walk the hue (right is clockwise) and wrap; up and down
 * walk the tone (up is outward, toward pale) and stop at the edges, because a
 * ring has no neighbour past the rim. Page keys jump a sector, and Home and End
 * go to the innermost and outermost tone of the same hue.
 */
export function step(cell: ICell, key: string): ICell | null {
  const hue = (delta: number): ICell =>
    CELLS[cellIndex((cell.hueIndex + delta + HUE_COUNT) % HUE_COUNT, cell.toneIndex)];
  const toneAt = (toneIndex: number): ICell =>
    CELLS[cellIndex(cell.hueIndex, Math.max(0, Math.min(TONES.length - 1, toneIndex)))];

  switch (key) {
    case 'ArrowRight':
      return hue(1);
    case 'ArrowLeft':
      return hue(-1);
    case 'PageDown':
      return hue(SECTOR_SIZE);
    case 'PageUp':
      return hue(-SECTOR_SIZE);
    case 'ArrowUp':
      return toneAt(cell.toneIndex + 1);
    case 'ArrowDown':
      return toneAt(cell.toneIndex - 1);
    case 'Home':
      return toneAt(0);
    case 'End':
      return toneAt(TONES.length - 1);
    default:
      return null;
  }
}

/**
 * `target` expressed as the angle nearest `previous`, so a marker turning from
 * 354° to 6° travels 12° clockwise instead of 348° back round the wheel. The
 * rotation is a CSS transition, and CSS interpolates the numbers it is given.
 */
export function unwrap(previous: number, target: number): number {
  const delta = ((((target - previous) % 360) + 540) % 360) - 180;
  return previous + delta;
}

/**
 * The continuum as a `conic-gradient`, starting at twelve o'clock like the
 * wheel. Stops are hex rather than `oklch()` so every browser draws the same
 * colours the cells were computed from; at 2° apart, the interpolation between
 * them is below a hex step.
 */
export const CONTINUUM_GRADIENT = ((): string => {
  const stops: string[] = [];
  for (let deg = 0; deg <= 360; deg += CONTINUUM_STEP) {
    stops.push(`${toHex(tone(CONTINUUM_TONE, deg % 360))} ${deg}deg`);
  }
  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
})();

/** The twelve sector labels, each the name at its sector's centre. */
export const SECTOR_LABELS: ReadonlyArray<{ readonly angle: number; readonly name: string }> =
  Array.from({ length: HUE_COUNT / SECTOR_SIZE }, (_, i) => {
    const angle = (i + 0.5) * SECTOR_SIZE * HUE_STEP;
    return { angle, name: hueName(angle) };
  });
