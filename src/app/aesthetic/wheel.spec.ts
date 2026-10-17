import { inGamut, maxChroma, oklchToLinear, toHex } from './colour';
import {
  angleOf,
  angularDistance,
  CELLS,
  cellAt,
  cellCentre,
  cellIndex,
  CONTINUUM_GRADIENT,
  CONTINUUM_STEP,
  CONTINUUM_TONE,
  HUE_COUNT,
  HUE_NAMES,
  HUE_STEP,
  hueName,
  polar,
  RADII,
  SECTOR_LABELS,
  step,
  tone,
  TONES,
  toneRadii,
  unwrap,
  VIEW_RADIUS,
} from './wheel';

/**
 * The wheel's promises, held as numbers: each cell is one displayable colour
 * at the hue its angle names, rings are lightnesses, and a pointer or a key
 * lands on the cell a visitor would expect.
 */
describe('colour', () => {
  it('maps OKLCH white, black and sRGB red to their known hex', () => {
    expect(toHex({ l: 1, c: 0, h: 0 })).toBe('#ffffff');
    expect(toHex({ l: 0, c: 0, h: 0 })).toBe('#000000');
    // #ff0000 is oklch(0.628 0.258 29.2) in the OKLab paper's matrices.
    expect(toHex({ l: 0.62796, c: 0.25768, h: 29.234 })).toBe('#ff0000');
  });

  it('finds the gamut boundary: in at maxChroma, out just beyond it', () => {
    for (const h of [0, 90, 180, 270]) {
      const c = maxChroma(0.6, h);
      expect(inGamut({ l: 0.6, c, h })).toBe(true);
      expect(inGamut({ l: 0.6, c: c + 0.002, h })).toBe(false);
    }
  });

  it('treats grey as linear-equal channels', () => {
    const [r, g, b] = oklchToLinear({ l: 0.5, c: 0, h: 123 });
    expect(r).toBeCloseTo(g, 6);
    expect(g).toBeCloseTo(b, 6);
  });
});

describe('wheel', () => {
  it('has HUE_COUNT × TONES cells, indexed by position, every one a different colour', () => {
    expect(CELLS.length).toBe(HUE_COUNT * TONES.length);
    CELLS.forEach((cell, i) => expect(cell.index).toBe(i));
    expect(new Set(CELLS.map((c) => c.hex)).size).toBe(CELLS.length);
  });

  it('puts every cell inside sRGB at its ring lightness and its centre hue', () => {
    for (const cell of CELLS) {
      expect(inGamut(cell.colour)).toBe(true);
      expect(cell.colour.l).toBe(TONES[cell.toneIndex].l);
      expect(cell.h).toBe((cell.hueIndex + 0.5) * HUE_STEP);
      expect(cell.colour.h).toBe(cell.h);
    }
  });

  it('orders the tones from dark at the centre to pale at the rim', () => {
    for (let i = 1; i < TONES.length; i++) {
      expect(TONES[i].l).toBeGreaterThan(TONES[i - 1].l);
    }
  });

  it('names each cell after the nearest anchor, prefixed by its tone', () => {
    const cell = CELLS[cellIndex(6, 2)]; // 39°: nearest anchor is Vermilion at 41°
    expect(cell.name).toBe('Rich vermilion');
    expect(hueName(359)).toBe('Rose');
  });

  it('leaves no sector label to a tie between two anchors', () => {
    for (const { angle } of SECTOR_LABELS) {
      const distances = HUE_NAMES.map((a) => angularDistance(a.h, angle)).sort((a, b) => a - b);
      expect(distances[1]).toBeGreaterThan(distances[0]);
    }
    expect(SECTOR_LABELS.length).toBe(12);
  });

  it('measures angles clockwise from twelve o’clock', () => {
    expect(angleOf(0, -1)).toBe(0);
    expect(angleOf(1, 0)).toBe(90);
    expect(angleOf(0, 1)).toBe(180);
    expect(angleOf(-1, 0)).toBe(270);
    const p = polar(100, 90);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
  });

  it('finds the cell under a point, and round-trips every cell centre', () => {
    for (const cell of CELLS) {
      const { x, y } = cellCentre(cell);
      expect(cellAt(x, y)).toBe(cell);
    }
    expect(cellAt(0, 0)).toBeNull();
    expect(cellAt(0, -(RADII.filigreeInner + 2))).toBeNull();
    expect(cellAt(0, -VIEW_RADIUS)).toBeNull();
  });

  it('answers the continuum with the cell of its tone at that hue', () => {
    const r = (RADII.continuumInner + RADII.continuumOuter) / 2;
    const { x, y } = polar(r, 100);
    expect(cellAt(x, y)).toBe(CELLS[cellIndex(Math.floor(100 / HUE_STEP), CONTINUUM_TONE)]);
  });

  it('keeps the rings inside the cell band and the band inside the continuum', () => {
    expect(toneRadii(0).inner).toBe(RADII.cellsInner);
    expect(toneRadii(TONES.length - 1).outer).toBeCloseTo(RADII.cellsOuter);
    expect(RADII.cellsOuter).toBeLessThan(RADII.continuumInner);
    expect(RADII.rete).toBeLessThan(VIEW_RADIUS);
  });

  it('samples the continuum from the same function the cells take', () => {
    expect(CONTINUUM_GRADIENT.startsWith('conic-gradient(from 0deg, ')).toBe(true);
    const stops = CONTINUUM_GRADIENT.match(/#[0-9a-f]{6} \d+deg/g) ?? [];
    expect(stops.length).toBe(360 / CONTINUUM_STEP + 1);
    // It closes on itself, and each stop is `tone()` at its angle.
    expect(stops.at(0)?.slice(0, 7)).toBe(stops.at(-1)?.slice(0, 7));
    expect(stops[3]).toBe(`${toHex(tone(CONTINUUM_TONE, 6))} 6deg`);
  });

  describe('step', () => {
    const at = (hue: number, tone: number): (typeof CELLS)[number] => CELLS[cellIndex(hue, tone)];

    it('turns through hues and wraps at twelve o’clock', () => {
      expect(step(at(0, 2), 'ArrowLeft')).toBe(at(HUE_COUNT - 1, 2));
      expect(step(at(HUE_COUNT - 1, 2), 'ArrowRight')).toBe(at(0, 2));
      expect(step(at(3, 2), 'PageDown')).toBe(at(8, 2));
      expect(step(at(3, 2), 'PageUp')).toBe(at(58, 2));
    });

    it('moves between tones and stops at the edges', () => {
      expect(step(at(10, 2), 'ArrowUp')).toBe(at(10, 3));
      expect(step(at(10, 2), 'ArrowDown')).toBe(at(10, 1));
      expect(step(at(10, TONES.length - 1), 'ArrowUp')).toBe(at(10, TONES.length - 1));
      expect(step(at(10, 0), 'ArrowDown')).toBe(at(10, 0));
      expect(step(at(10, 3), 'Home')).toBe(at(10, 0));
      expect(step(at(10, 3), 'End')).toBe(at(10, TONES.length - 1));
    });

    it('ignores keys it does not use', () => {
      expect(step(at(10, 3), 'a')).toBeNull();
    });
  });

  it('unwraps an angle to the short way round', () => {
    expect(unwrap(354, 6)).toBe(366);
    expect(unwrap(6, 354)).toBe(-6);
    expect(unwrap(720 + 90, 100)).toBe(820);
  });
});
