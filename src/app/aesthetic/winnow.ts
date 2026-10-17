import { oklchToLinear } from './colour';
import { Deficiency, DEFICIENCIES, simulate } from './cvd';
import { hueEffect, ILab, pairHarmony, toLab, yellowEffect } from './harmony';
import { angularDistance, CELLS, ICell, isNeutral } from './wheel';

/**
 * Winnowing: from one primary, the secondary and tertiary that make the best
 * aesthetic the wheel can offer.
 *
 * "Best" is answerable because an aesthetic has roles. The primary is the
 * ground, most of what is seen. The secondary partners it over large areas.
 * The tertiary is the accent: small, and laid on the ground as a figure. Every
 * ordered pair of other cells is a candidate, 479 × 478 = 228,962 for each
 * primary, and all of them are searched.
 *
 * **Filters** say what an aesthetic must be able to do, and a candidate
 * passes or fails them:
 *
 * - Three colours, not two and a near-copy: every pair `MIN_DISTINCT` apart.
 * - It can set its own text: some pair reaches WCAG's 4.5:1.
 * - The accent stands off the ground: `ACCENT_DISTANCE`, twice the above.
 * - No olive companion (`OLIVE`).
 * - The accent is a colour, not one of the tinted neutrals: charcoal and
 *   chalk may be the ground or partner it, never the accent. A charcoal dot
 *   on pale rose is a fine pairing, but it is a second neutral rather than an
 *   accent, and it began winning on harmony once pastel accents stopped
 *   counting as vivid (`FULL_ACCENT_CHROMA`).
 * - The accent stays a different colour, from the ground and the secondary,
 *   for someone missing any one cone type (`CVD_CHECKED`, `cvd.ts`). Before
 *   this filter, 28 aesthetics failed it for deuteranopia, most of them a
 *   pale cyan accent on a chalk panel: different to typical eyes only by a
 *   hue that red-green deficiency removes. When it was added, enforcing all
 *   three deficiencies changed 40 of the 480 and moved mean harmony from
 *   0.170 to 0.165; its replacements were more vivid and looked better, which
 *   is what led to `FULL_ACCENT_CHROMA`. Under that, it changes 28.
 *
 * **The score** ranks the survivors, and has two terms because the research
 * found two different things:
 *
 * - Harmony (`harmony.ts`). Ou & Luo's two-colour model, combined over the
 *   three pairs as Ou et al. (2011) combine it, but weighted by area
 *   (`AREA_WEIGHTS`) and with the model's hue effect left out except for its
 *   khaki penalty (`profile`). It rewards colours that share a hue and differ
 *   in lightness, and lighter colours generally.
 * - Figure, for the accent alone (`figural`). Schloss & Palmer (2011) found
 *   that a pair seen as a whole is preferred, and judged harmonious, as its
 *   hues get closer, but a colour seen as a figure on a ground is preferred as
 *   its hue contrast with that ground grows, and on grounds of contrasting
 *   lightness. An accent is that figure.
 *
 * They pull against each other, and that is the design. Harmony alone returns
 * two tints of the primary's own hue: harmonious, and dull. Figure alone
 * returns the loudest complement. `FIGURE_WEIGHT` sets the trade.
 *
 * Every decision below that is not taken from a paper was taken by rendering
 * the aesthetic of every primary as a small layout and looking at the sheet,
 * and each says what it fixed. Most were taken on the first wheel, of six
 * colour rings and 360 cells, before the neutral rings; the counts quoted
 * from then are from that wheel. The first version averaged Ou's pairs
 * plainly and kept the whole model: 68 of the 360 primaries were given the
 * same pale blue secondary, and reds were given cyan, because the model's
 * per-colour hue effect rewards blue and penalises red whatever they are
 * paired with, and a search over every candidate finds that every time. With
 * every other decision below in place, keeping it whole still gave Pale amber
 * to 46 primaries and Pale gold to 40, its other favourite being light yellow.
 *
 * Ties go to the candidate met first, in cell order, so the mapping is a
 * function: one primary, one aesthetic, every time.
 */

/** The smallest OKLab distance at which two cells read as different colours. */
export const MIN_DISTINCT = 0.1;

/** WCAG 2 SC 1.4.3, contrast for body text. */
export const TEXT_CONTRAST = 4.5;

/**
 * How far the accent must sit from the ground in OKLab: twice `MIN_DISTINCT`.
 *
 * Not WCAG's 3:1 for graphical objects, though that was the first version,
 * because 3:1 is a luminance ratio and this wheel cannot meet it on a third of
 * its own cells. Its darkest ring is L 0.38 and its palest 0.90, neither black
 * nor white, so a mid-tone ground (Rich, Bright) sits under 3:1 from both ends
 * and would have no aesthetic at all. An accent stands out by hue and chroma
 * as much as by lightness, and OKLab distance counts all three.
 */
export const ACCENT_DISTANCE = 0.2;

/**
 * The olives: the dark rings across the yellow band. A visitor may choose one
 * as a primary; the winnowing never adds one. Two independent findings agree:
 * Ou & Luo found dark yellows, "khaki", among the least harmonious colours,
 * and Palmer & Schloss (PNAS, 2010) that "browns and olives may be
 * universally disliked". The first is already a penalty in the score, but a
 * small one (about 0.07 on Ou's scale, against an accent term worth up to
 * 0.6) that fades fast past CIELAB hue 90°, so olive-greens escaped it and
 * every lavender, whose complement is yellow, was given an olive accent. A
 * rule is clearer than a larger weight, and says the same thing.
 *
 * Browns are not excluded, though the same sentence names them: in the sheet
 * they were the accents that looked most deliberate, chocolate on sky blue.
 *
 * The band ends at 145°, just short of the green anchor at 146°, so that the
 * dark cell at 141° is inside it and the one at 147° is not: the first is an
 * olive-green and the second a forest green. It ended at 140° until the
 * magenta corner showed what a band edge invites: the accent there was the
 * dark cell at 141°, one degree outside, an olive in all but the number.
 */
export const OLIVE = { hueFrom: 90, hueTo: 145, maxLightness: 0.5, minChroma: 0.04 } as const;

/**
 * The chroma floor keeps the charcoal ring out: a near-black with a trace of
 * warmth sits in the band's hues and under its lightness, but it is not khaki.
 */
export function isOlive(cell: ICell): boolean {
  const { l, c } = cell.colour;
  return (
    cell.h >= OLIVE.hueFrom &&
    cell.h <= OLIVE.hueTo &&
    l <= OLIVE.maxLightness &&
    c >= OLIVE.minChroma
  );
}

/**
 * The deficiencies the accent must stay distinct under, from both the ground
 * and the secondary, by `MIN_DISTINCT`: the same distance the wheel asks of
 * any two colours that are meant to read as two. The accent sits on both (a
 * mark on the ground, a rule on the panel), so it must survive both.
 */
export const CVD_CHECKED: readonly Deficiency[] = DEFICIENCIES;

/**
 * How much the accent's figural term counts against harmony. Chosen by eye,
 * and not delicately: weights of 0.5 and 0.8 give the same aesthetic as 0.6
 * for about four primaries in five (383 and 381 of 480), and the spec holds
 * at least three in four. Below 0.5 accents begin to collapse onto the
 * ground's own hue.
 */
export const FIGURE_WEIGHT = 0.6;

/**
 * How much each pair's harmony counts: in proportion to the product of the two
 * colours' areas (`AREA_SPLIT`), at the 60/30/10 split interior designers use
 * for a dominant, a secondary and an accent colour.
 *
 * This is where the score departs from Ou et al. (2011), whose three-colour
 * harmony weights the pairs equally; their test wheels gave each colour an
 * equal share. An aesthetic does not: the ground is most of what is seen and
 * the accent a sliver. Weighted equally, the secondary was pulled toward the
 * accent as hard as toward the ground, and the deep row of the sheet came out
 * as two cyans on every red. Their plain average did predict unequal-area
 * interiors well (r = 0.93), so this is a judgement about roles, not a
 * correction of their result.
 */
export const AREA_SPLIT = { primary: 0.6, secondary: 0.3, tertiary: 0.1 } as const;

export const AREA_WEIGHTS = ((): { ps: number; pt: number; st: number } => {
  const { primary: p, secondary: s, tertiary: t } = AREA_SPLIT;
  const total = p * s + p * t + s * t;
  return { ps: (p * s) / total, pt: (p * t) / total, st: (s * t) / total };
})();

/**
 * The CIELAB chroma beyond which ranking stops trusting Ou & Luo's model, and
 * treats a colour as if it were no more chromatic than this.
 *
 * Their 54 colours, as Figure 3 of the 2008 account plots them, lie within
 * CIELAB axes running to a* 75 and b* 80: the model was fitted below about
 * chroma 80, and 49 cells of this wheel are beyond it, up to about 100 at the
 * magenta where sRGB's own gamut peaks. Out there its chromatic term goes on
 * penalising chroma difference with nothing in the data to say it should.
 * That was the magenta corner: Bright magenta, at the gamut's peak, sat 26
 * to 30 units of chroma from its own darker tint, where its neighbours sat 12
 * to 18, so the model rated the tonal pair at nearly nothing and chalk won the
 * secondary. Held to 80, the corner takes the same plum-and-pale-green
 * pattern as the row around it, 48 aesthetics change across the wheel, and
 * mean harmony is unmoved. The page still reports the model unclamped.
 *
 * 80 is read off a figure's axes, not a stated range, so it is approximate;
 * what it rests on is that the model's data stop somewhere near it.
 */
const SAMPLED_CHROMA = 80;

/** OKLCH chroma at which a ground is treated as fully showing its hue. */
const FULL_HUE_CHROMA = 0.08;

/**
 * The same for an accent, set higher: an accent is the one colour in an
 * aesthetic whose job is to be colourful.
 *
 * At 0.08, a pastel accent already counted as showing its hue in full, so the
 * figural term could not tell it from a vivid one (0.979 against 0.984, over
 * the cases measured) and harmony, which favours paler partners, decided:
 * 201 of 480 accents came out under chroma 0.1. The CVD filter exposed this
 * when its replacements, more vivid, looked better than what they replaced.
 * Palmer & Schloss (2010) found saturated colours preferred to light and
 * muted ones, and the accent is where that finding belongs.
 *
 * 0.12 was measured against 0.15 and 0.20, judged by the same tests as every
 * other choice here. It recovers 26 of the 39 vivid replacements without the
 * filter's help, leaves 15 pastel accents rather than 201, and lowers the most
 * any one accent is reused from 24 to 19. Higher caps recover all 39, but give
 * one accent to 41 and 55 primaries. Adding Helson & Lansford's saturation
 * contrast to `figural` instead was tried, and failed: it rewarded muted
 * accents on vivid grounds and put the black dots back.
 */
const FULL_ACCENT_CHROMA = 0.12;

/** OKLab lightness difference at which an accent fully stands off its ground. */
const FULL_LIGHTNESS_CONTRAST = 0.3;

/** One cell's figures, computed once: what every filter and term reads. */
interface IProfile {
  readonly lab: ILab;
  /** `lab` with its chroma held to `SAMPLED_CHROMA`, for ranking. */
  readonly sampledLab: ILab;
  /** WCAG relative luminance. */
  readonly y: number;
  /** OKLab coordinates, for distance. */
  readonly ok: readonly [number, number, number];
  /** How much hue this colour shows as an accent: 0 at grey, 1 from `FULL_ACCENT_CHROMA`. */
  readonly hueWeight: number;
  /**
   * How much hue it lends as a ground. The same, except that a tinted
   * neutral's tint counts in full: see `figural`.
   */
  readonly groundHueWeight: number;
  /** The part of Ou & Luo's CH that belongs to this colour and ranking omits. */
  readonly unranked: number;
  /** OKLab as each of `DEFICIENCIES` sees it, in that order. */
  readonly cvd: ReadonlyArray<readonly [number, number, number]>;
}

/**
 * Ou & Luo's hue effect is the one part of their model that belongs to a
 * colour alone rather than to the pair: how harmonious that hue tends to be
 * with anything. For a fixed primary it reduces to a ranking of candidates by
 * themselves, which is precisely what a search exploits, so ranking omits it,
 * except for the yellow effect's negative half, the khaki penalty (see
 * `OLIVE`). Removing only the bonus was tried first; the penalty on red then
 * steered every red away from its own tints.
 */
function profile(cell: ICell): IProfile {
  const [r, g, b] = oklchToLinear(cell.colour).map((v) => Math.min(1, Math.max(0, v)));
  const { l, c, h } = cell.colour;
  const lab = toLab(cell.colour);
  const keep = Math.min(1, SAMPLED_CHROMA / lab.c);
  return {
    lab,
    sampledLab: { ...lab, a: lab.a * keep, b: lab.b * keep, c: lab.c * keep },
    y: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    ok: [l, c * Math.cos(h * (Math.PI / 180)), c * Math.sin(h * (Math.PI / 180))],
    hueWeight: Math.min(1, c / FULL_ACCENT_CHROMA),
    groundHueWeight: isNeutral(cell) ? 1 : Math.min(1, c / FULL_HUE_CHROMA),
    unranked: hueEffect(lab) - Math.min(0, yellowEffect(lab)),
    cvd: DEFICIENCIES.map((deficiency) => simulate(cell.colour, deficiency)),
  };
}

/**
 * The smallest OKLab distance between two cells under any of `deficiencies`:
 * how close they come to being one colour for someone, among the people the
 * filter is protecting.
 */
function cvdDistance(t: Tables, i: number, j: number, deficiencies: readonly number[]): number {
  const a = t.profiles[i].cvd;
  const b = t.profiles[j].cvd;
  let least = Infinity;
  for (const k of deficiencies) {
    least = Math.min(least, Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1], a[k][2] - b[k][2]));
  }
  return least;
}

/** WCAG contrast ratio between two luminances, always ≥ 1. */
export function contrastRatio(y1: number, y2: number): number {
  return (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
}

/**
 * The figural term: how well an accent stands as a figure on its ground, in
 * [0, 1], as the mean of Schloss & Palmer's two effects. Hue contrast: 0 at
 * the same hue, 1 opposite, scaled by how much hue each colour has, since a
 * near-grey contrasts with nothing. Lightness contrast: OKLab ΔL, full at
 * `FULL_LIGHTNESS_CONTRAST`. Without the second, bright reds were given a
 * pale cyan of their own lightness, the pairing that vibrates at its edge.
 *
 * A tinted neutral ground is the exception to "a near-grey contrasts with
 * nothing". Scaled by its own chroma, its hue counted for almost nothing,
 * and with no hue to work against the accent fell to harmony alone, which
 * picked the least colourful accent going: every charcoal got a pale cyan.
 * But a visitor who chose Charcoal rose over Charcoal cobalt chose a tint,
 * and the tint is the only hue such a cell has, so as a ground it counts in
 * full. A neutral is never an accent at all; see the filters in the header.
 * Measuring the term as OKLab a/b
 * distance instead was tried, and it was worse both ways: vivid grounds were
 * given black dots, and every charcoal the same vivid green.
 */
function figural(accent: ICell, ground: ICell, profiles: readonly IProfile[]): number {
  const hue =
    ((1 - Math.cos(angularDistance(accent.h, ground.h) * (Math.PI / 180))) / 2) *
    profiles[accent.index].hueWeight *
    profiles[ground.index].groundHueWeight;
  const lightness = Math.min(
    1,
    Math.abs(accent.colour.l - ground.colour.l) / FULL_LIGHTNESS_CONTRAST
  );
  return (hue + lightness) / 2;
}

/**
 * Everything pairwise, built once on first use: Ou & Luo's model for every
 * pair of cells (64,980 evaluations), contrast, distance and the figural term.
 * After that a candidate costs a handful of array reads, which is what lets
 * every primary search all of its candidates in about a millisecond.
 */
class Tables {
  public readonly n = CELLS.length;
  public readonly profiles = CELLS.map(profile);
  public readonly olive = CELLS.map(isOlive);
  public readonly neutral = CELLS.map(isNeutral);
  /** Ou & Luo's CH, unmodified: what the page reports. */
  public readonly faithful = new Float64Array(this.n * this.n);
  /** CH as ranking uses it; see `profile`. */
  public readonly ranked = new Float64Array(this.n * this.n);
  public readonly contrast = new Float64Array(this.n * this.n);
  /** OKLab distance. */
  public readonly distance = new Float64Array(this.n * this.n);
  /** Cell j as the accent on ground i, at `i * n + j`. */
  public readonly figure = new Float64Array(this.n * this.n);
  /**
   * `cvdDistance` under every one of `CVD_CHECKED`, precomputed because
   * computing it per candidate took a search from about 1ms to 11ms.
   */
  public readonly cvdLeast = new Float64Array(this.n * this.n);

  constructor() {
    const checked = CVD_CHECKED.map((x) => DEFICIENCIES.indexOf(x));
    const { n, profiles } = this;
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const a = profiles[i];
        const b = profiles[j];
        const ch = pairHarmony(a.lab, b.lab);
        const chRanked = pairHarmony(a.sampledLab, b.sampledLab);
        const d = Math.hypot(a.ok[0] - b.ok[0], a.ok[1] - b.ok[1], a.ok[2] - b.ok[2]);
        this.faithful[i * n + j] = this.faithful[j * n + i] = ch;
        this.ranked[i * n + j] = this.ranked[j * n + i] = chRanked - a.unranked - b.unranked;
        this.contrast[i * n + j] = this.contrast[j * n + i] = contrastRatio(a.y, b.y);
        this.distance[i * n + j] = this.distance[j * n + i] = d;
        // Symmetric only because hue and lightness distance are; kept as two
        // entries so an asymmetric term would not need a new layout.
        this.figure[i * n + j] = figural(CELLS[j], CELLS[i], profiles);
        this.figure[j * n + i] = figural(CELLS[i], CELLS[j], profiles);
        this.cvdLeast[i * n + j] = this.cvdLeast[j * n + i] = cvdDistance(this, i, j, checked);
      }
    }
  }
}

let tables: Tables | null = null;

function getTables(): Tables {
  return (tables ??= new Tables());
}

/**
 * Builds the tables now rather than on the first choice. They cost about 25ms
 * in Node on a desktop and more on a phone; the page calls this once the
 * wheel has drawn, so the first choice does not pay for it.
 */
export function warm(): void {
  getTables();
}

/** OKLab distance between two cells. */
export function distanceBetween(a: ICell, b: ICell): number {
  const { distance, n } = getTables();
  return distance[a.index * n + b.index];
}

/** WCAG contrast ratio between two cells. */
export function contrastBetween(a: ICell, b: ICell): number {
  const { contrast, n } = getTables();
  return contrast[a.index * n + b.index];
}

/** One aesthetic, with the figures that chose it, for the page to show. */
export interface IAesthetic {
  readonly primary: ICell;
  readonly secondary: ICell;
  readonly tertiary: ICell;
  /** Ou et al.'s three-colour harmony, unmodified: the plain mean of Ou & Luo's CH. */
  readonly harmony: number;
  /** The accent's figural term, in [0, 1]. */
  readonly figure: number;
  /** What ranking maximised. */
  readonly score: number;
  /** The highest-contrast pair, which is where the aesthetic's text goes. */
  readonly text: { readonly ink: ICell; readonly paper: ICell; readonly ratio: number };
}

/** Knobs a spec may turn to show the result does not hang on them. */
export interface IWinnowOptions {
  readonly figureWeight?: number;
  /** Which deficiencies the accent must survive; all of `CVD_CHECKED` by default. */
  readonly deficiencies?: readonly Deficiency[];
}

/** OKLab distance between two cells as the person with `deficiency` sees them. */
export function cvdDistanceBetween(a: ICell, b: ICell, deficiency: Deficiency): number {
  return cvdDistance(getTables(), a.index, b.index, [DEFICIENCIES.indexOf(deficiency)]);
}

function scoreOf(t: Tables, p: number, s: number, a: number, figureWeight: number): number {
  const { ranked: h, n } = t;
  const harmony =
    AREA_WEIGHTS.ps * h[p * n + s] +
    AREA_WEIGHTS.pt * h[p * n + a] +
    AREA_WEIGHTS.st * h[s * n + a];
  return harmony + figureWeight * t.figure[p * n + a];
}

function build(primary: ICell, secondary: ICell, tertiary: ICell, score: number): IAesthetic {
  const { faithful: h, contrast: k, figure, n } = getTables();
  const [p, s, t] = [primary.index, secondary.index, tertiary.index];
  // Ink is the darker of the pair, so text reads the way a page usually does.
  const pairs: Array<[ICell, ICell, number]> = [
    [primary, secondary, k[p * n + s]],
    [primary, tertiary, k[p * n + t]],
    [secondary, tertiary, k[s * n + t]],
  ];
  const [one, two, ratio] = pairs.reduce((best, pair) => (pair[2] > best[2] ? pair : best));
  const [ink, paper] = one.colour.l < two.colour.l ? [one, two] : [two, one];
  return {
    primary,
    secondary,
    tertiary,
    harmony: (h[p * n + s] + h[p * n + t] + h[s * n + t]) / 3,
    figure: figure[p * n + t],
    score,
    text: { ink, paper, ratio },
  };
}

/** Whether a secondary may partner primary `p` at all, before any accent. */
function admitsSecondary(t: Tables, p: number, s: number): boolean {
  // `d[p * n + p]` is 0, so this also keeps the primary from being its own
  // secondary; `admitsAccent` does the same for both.
  return t.distance[p * t.n + s] >= MIN_DISTINCT && !t.olive[s];
}

/**
 * Whether the filters admit accent `a` with primary `p` and secondary `s`.
 * The colour-vision check runs last, being the dearest, and so only on
 * candidates that have passed everything else.
 */
function admitsAccent(
  t: Tables,
  p: number,
  s: number,
  a: number,
  deficiencies: readonly number[] | null
): boolean {
  const { contrast: k, distance: d, n } = t;
  if (
    d[p * n + a] < ACCENT_DISTANCE ||
    d[s * n + a] < MIN_DISTINCT ||
    t.olive[a] ||
    t.neutral[a] ||
    Math.max(k[p * n + s], k[p * n + a], k[s * n + a]) < TEXT_CONTRAST
  ) {
    return false;
  }
  // `null` is the default set, read from the table; anything else is a
  // spec asking what a different set would have done, computed on the spot.
  const least = (i: number): number =>
    deficiencies === null ? t.cvdLeast[i * n + a] : cvdDistance(t, i, a, deficiencies);
  return least(p) >= MIN_DISTINCT && least(s) >= MIN_DISTINCT;
}

interface ICandidate {
  readonly s: number;
  readonly a: number;
  readonly score: number;
}

/**
 * Keeps `best` as the top `count` candidates, best first. A strictly greater
 * score is needed to displace one, which is what sends ties to the candidate
 * met first.
 */
function keep(best: ICandidate[], candidate: ICandidate, count: number): void {
  if (best.length === count && candidate.score <= best[count - 1].score) {
    return;
  }
  best.push(candidate);
  best.sort((x, y) => y.score - x.score);
  best.length = Math.min(best.length, count);
}

/**
 * The best `count` aesthetics for a primary, best first. The page shows the
 * first; the rest exist so that a later version can choose among them.
 */
export function rank(primary: ICell, count = 1, options: IWinnowOptions = {}): IAesthetic[] {
  const t = getTables();
  const figureWeight = options.figureWeight ?? FIGURE_WEIGHT;
  const deficiencies = options.deficiencies
    ? options.deficiencies.map((x) => DEFICIENCIES.indexOf(x))
    : null;
  const p = primary.index;
  const best: ICandidate[] = [];

  for (let s = 0; s < t.n; s++) {
    if (!admitsSecondary(t, p, s)) {
      continue;
    }
    for (let a = 0; a < t.n; a++) {
      if (admitsAccent(t, p, s, a, deficiencies)) {
        keep(best, { s, a, score: scoreOf(t, p, s, a, figureWeight) }, count);
      }
    }
  }
  return best.map(({ s, a, score }) => build(primary, CELLS[s], CELLS[a], score));
}

// ----- The varied set -----
//
// The best few candidates for a primary are near-copies: the same structure,
// one cell over. A set worth choosing from at random has to be built for
// variety, so it holds the best aesthetic of each structure instead: one per
// relation between the accent and the ground, and one with a neutral partner,
// each kept only if it is good enough to stand beside the best.

/** How far round the wheel the accent sits from the ground. */
export type Relation = 'tonal' | 'analogous' | 'split' | 'complementary';

/**
 * Upper bounds, in degrees of hue, of each relation but the last. Tonal ends
 * where the secondary's "own hue family" ends elsewhere in this file and its
 * spec, 45°; complementary is the last 30° before the exact opposite.
 */
const RELATION_BOUNDS: ReadonlyArray<readonly [Relation, number]> = [
  ['tonal', 45],
  ['analogous', 100],
  ['split', 150],
];

export function relationOf(ground: ICell, accent: ICell): Relation {
  const turn = angularDistance(accent.h, ground.h);
  return RELATION_BOUNDS.find(([, below]) => turn < below)?.[0] ?? 'complementary';
}

/** A member's structure: its accent's relation, or that it has a neutral partner. */
export type Structure = Relation | 'neutral partner';

export interface IVariation {
  readonly aesthetic: IAesthetic;
  readonly structure: Structure;
}

/**
 * How far below the best a member may score and still be offered. Read off a
 * sheet of every structure for twelve primaries, each tile labelled with its
 * gap: down to about 0.23 every structure still looked like a considered
 * aesthetic, and past 0.25 some did and some did not (a charcoal panel on pale
 * ultramarine, -0.35, was among the best on the sheet; chalk and forest green
 * on rich amethyst, -0.31, among the weakest). Measured over all 480
 * primaries, the median gap is 0 for complementary, 0.03 for split, 0.12 for
 * analogous and tonal, and 0.22 for a neutral partner.
 */
export const VARIATION_FLOOR = 0.25;

/**
 * How different a member must be from every member before it: the OKLab
 * distance between their secondaries plus that between their accents. Without
 * it the best split was often the best complementary one cell over (pale
 * cyan against pale mint, on the same dark red), because the best split sits
 * just inside the 150° boundary.
 */
export const VARIATION_DIFFERENCE = 0.15;

/** Runners-up kept per structure, so a near-copy can be passed over. */
const RUNNERS_UP = 24;

const STRUCTURES: readonly Structure[] = [
  'tonal',
  'analogous',
  'split',
  'complementary',
  'neutral partner',
];

/** `VARIATION_DIFFERENCE`'s measure between two candidates. */
function difference(t: Tables, x: ICandidate, y: ICandidate): number {
  return t.distance[x.s * t.n + y.s] + t.distance[x.a * t.n + y.a];
}

/**
 * The varied set for a primary, best first. One pass over every candidate
 * keeps the best `RUNNERS_UP` of each structure (a candidate with a neutral
 * partner competes in that structure and in its relation's). Then, taking the
 * structures in order of their best score, each contributes its best
 * candidate that scores within `VARIATION_FLOOR` of the best overall and
 * differs by `VARIATION_DIFFERENCE` from every member already in. The best
 * overall always comes first and is `aestheticFor(primary)`; a structure with
 * nothing good enough and different enough is left out.
 */
export function variations(primary: ICell, options: IWinnowOptions = {}): IVariation[] {
  const t = getTables();
  const kept = runnersUp(t, primary, options.figureWeight ?? FIGURE_WEIGHT);
  return assemble(t, kept).map(({ candidate: c, structure }) => ({
    aesthetic: build(primary, CELLS[c.s], CELLS[c.a], c.score),
    structure,
  }));
}

/** The pass over every candidate, keeping the best `RUNNERS_UP` per structure. */
function runnersUp(t: Tables, primary: ICell, figureWeight: number): Map<Structure, ICandidate[]> {
  const p = primary.index;
  const kept = new Map<Structure, ICandidate[]>(STRUCTURES.map((s) => [s, []]));
  for (let s = 0; s < t.n; s++) {
    if (!admitsSecondary(t, p, s)) {
      continue;
    }
    for (let a = 0; a < t.n; a++) {
      if (!admitsAccent(t, p, s, a, null)) {
        continue;
      }
      const candidate = { s, a, score: scoreOf(t, p, s, a, figureWeight) };
      keep(kept.get(relationOf(primary, CELLS[a])) ?? [], candidate, RUNNERS_UP);
      if (t.neutral[s]) {
        keep(kept.get('neutral partner') ?? [], candidate, RUNNERS_UP);
      }
    }
  }
  return kept;
}

/** The greedy choice of members from each structure's runners-up. */
function assemble(
  t: Tables,
  kept: Map<Structure, ICandidate[]>
): Array<{ candidate: ICandidate; structure: Structure }> {
  const leaders = STRUCTURES.filter((s) => kept.get(s)?.length).sort(
    (x, y) => (kept.get(y)?.[0].score ?? 0) - (kept.get(x)?.[0].score ?? 0)
  );
  const top = kept.get(leaders[0])?.[0].score ?? 0;
  const chosen: Array<{ candidate: ICandidate; structure: Structure }> = [];
  for (const structure of leaders) {
    const pick = kept
      .get(structure)
      ?.find(
        (c) =>
          top - c.score <= VARIATION_FLOOR &&
          chosen.every((m) => difference(t, m.candidate, c) >= VARIATION_DIFFERENCE)
      );
    if (pick) {
      chosen.push({ candidate: pick, structure });
    }
  }
  return chosen;
}

/** The one aesthetic for a primary: the best that survives the filters. */
export function aestheticFor(primary: ICell, options: IWinnowOptions = {}): IAesthetic {
  const [best] = rank(primary, 1, options);
  if (!best) {
    // Unreachable for this wheel, and asserted for every primary by the spec;
    // a wheel edited into one should fail loudly rather than draw nothing.
    throw new Error(`No aesthetic survives the filters for ${primary.name}.`);
  }
  return best;
}
