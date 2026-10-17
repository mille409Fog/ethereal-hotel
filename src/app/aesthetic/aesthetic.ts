import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import {
  angularDistance,
  CELLS,
  cellAt,
  cellCentre,
  cellIndex,
  cellPath,
  CONTINUUM_GRADIENT,
  HUE_COUNT,
  HUE_STEP,
  ICell,
  markerPath,
  oklchText,
  polar,
  RADII,
  SECTOR_LABELS,
  SECTOR_SIZE,
  step,
  TONES,
  toneRadii,
  unwrap,
  VIEW_RADIUS,
} from './wheel';
import { aestheticFor, AREA_SPLIT, IAesthetic, warm } from './winnow';

/** The three colours an aesthetic is made of, in the order they are chosen. */
export const ROLES = ['primary', 'secondary', 'tertiary'] as const;
export type Role = (typeof ROLES)[number];
export type Triad = Readonly<Record<Role, ICell | null>>;

/** What each role does in an aesthetic; `winnow.ts` scores them by these. */
const ROLE_DUTIES: Readonly<Record<Role, string>> = {
  primary: 'The ground',
  secondary: 'Partners the ground',
  tertiary: 'The accent',
};

/** Where keyboard focus enters the wheel before anything is chosen: rich red. */
const ENTRY_CELL =
  CELLS[
    cellIndex(
      4,
      TONES.findIndex((t) => t.name === 'Rich')
    )
  ];

/** A straight segment in user units, for the bezel's ticks. */
interface ISegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** `:focus-visible`, where the engine knows it; jsdom's selector engine may not. */
function matchesFocusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

function radial(deg: number, r0: number, r1: number): ISegment {
  const a = polar(r0, deg);
  const b = polar(r1, deg);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** Moves a shape drawn at the origin out to radius `r` at angle `deg`, facing outward. */
function onRim(deg: number, r: number): string {
  return `rotate(${deg}) translate(0 ${-r})`;
}

/**
 * Like `onRim`, but text in the lower half is turned a further half-turn so
 * that no label round the bezel is ever read upside down.
 */
function upright(deg: number, r: number): string {
  return deg > 90 && deg < 270 ? `rotate(${deg - 180}) translate(0 ${r})` : onRim(deg, r);
}

/** A full ring between two radii, as one even-odd path. */
function annulus(r0: number, r1: number): string {
  const circle = (r: number): string => `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;
  return circle(r1) + circle(r0);
}

/**
 * `/aesthetic`: the colour wheel of an aesthetic generator.
 *
 * An aesthetic is three colours, primary, secondary and tertiary. The visitor
 * chooses the primary from the wheel's 480 cells, and `winnow.ts` chooses the
 * other two for it; this component only draws what that returns: a hand per
 * role on the wheel, the figure joining them, the three cards and a specimen
 * of the aesthetic in use.
 *
 * The wheel is SVG over two CSS layers. SVG for everything a pointer or a key
 * can land on, because each cell is a real element with a role and a name. CSS
 * for the continuum and its aura, because SVG has no conic gradient and
 * approximating one with hundreds of slivers would cost more DOM than the
 * cells themselves. `wheel.ts` owns every number both of them use.
 *
 * Keyboard: the cells are a radio group with one tab stop. Arrows walk the
 * wheel, and selection follows focus, as it does in any radio group; see
 * `step` for the keys. A portfolio section like `/gallery`: it reads no API,
 * writes nothing, and owns its `main` landmark.
 */
@Component({
  selector: 'app-aesthetic',
  templateUrl: './aesthetic.html',
  styleUrl: './aesthetic.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Aesthetic {
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('wheel');

  // ----- The wheel's fixed drawing, computed once -----

  public readonly cells = CELLS;
  public readonly tones = TONES;
  public readonly paths = CELLS.map(cellPath);
  public readonly radii = RADII;
  public readonly viewBox = `${-VIEW_RADIUS} ${-VIEW_RADIUS} ${2 * VIEW_RADIUS} ${2 * VIEW_RADIUS}`;
  public readonly continuum = CONTINUUM_GRADIENT;
  public readonly wheelLabel = `Colour wheel, ${HUE_COUNT} hues in ${TONES.length} tones`;
  /** Where the glaze's shadow starts: the cells' inner edge, on its gradient's radius. */
  public readonly glazeStart = RADII.cellsInner / RADII.cellsOuter;
  public readonly labels = SECTOR_LABELS.map((label) => ({
    ...label,
    transform: upright(label.angle, RADII.labels),
  }));
  public readonly continuumHit = annulus(RADII.continuumInner, RADII.continuumOuter);
  public readonly markerPaths = TONES.map((_, i) => markerPath(i));

  /** A marker's pointer: a lozenge from just outside the continuum across the bezel. */
  public readonly jewel = `M0 ${-(RADII.continuumOuter + 2)} l6 -11 l-6 -11 l-6 11Z`;

  /** A tick at every cell boundary, and a longer one every sector. */
  public readonly minuteTicks = Array.from({ length: HUE_COUNT }, (_, i) =>
    radial(i * HUE_STEP, RADII.bezel + 3, RADII.minuteTick)
  ).filter((_, i) => i % SECTOR_SIZE !== 0);
  public readonly hourTicks = Array.from({ length: HUE_COUNT / SECTOR_SIZE }, (_, i) => {
    const angle = i * SECTOR_SIZE * HUE_STEP;
    return {
      angle,
      numeral: upright(angle, RADII.hourTick + 8),
      ...radial(angle, RADII.bezel + 3, RADII.hourTick),
    };
  });

  /** Thirty lozenges round the filigree, with a bead between each pair. */
  private readonly filigreeMid = (RADII.filigreeInner + RADII.filigreeOuter) / 2;
  public readonly lozenges = Array.from({ length: 30 }, (_, i) => onRim(i * 12, this.filigreeMid));
  public readonly beads = Array.from({ length: 30 }, (_, i) => polar(this.filigreeMid, i * 12 + 6));

  /** Eight four-pointed stars on the turning rim. */
  public readonly stars = Array.from({ length: 8 }, (_, i) => onRim(i * 45, RADII.rete));

  /** The rings dividing the tones, drawn over the cells' own edges. */
  public readonly toneBoundaries = TONES.slice(1).map((_, i) => toneRadii(i + 1).inner);

  // ----- State -----

  /** The visitor's choice. Everything else on the page follows from it. */
  public readonly primary = signal<ICell | null>(null);

  /** The aesthetic `winnow.ts` builds around the primary. */
  public readonly aesthetic = computed((): IAesthetic | null => {
    const primary = this.primary();
    return primary ? aestheticFor(primary) : null;
  });

  public readonly triad = computed((): Triad => ({
    primary: this.primary(),
    secondary: this.aesthetic()?.secondary ?? null,
    tertiary: this.aesthetic()?.tertiary ?? null,
  }));

  /** The cell under the pointer, if any. */
  public readonly hovered = signal<ICell | null>(null);

  /** The cell holding keyboard focus, while the wheel has it. */
  public readonly focused = signal<ICell | null>(null);

  /**
   * Whether focus arrived from the keyboard. A click focuses its cell too,
   * and drawing the focus ring then would cover the marker the click just
   * placed, so the ring follows the browser's own `:focus-visible` decision.
   */
  private readonly focusVisible = signal(false);

  /** The cell drawn with a focus ring: focused, and from the keyboard. */
  public readonly ringed = computed(() => (this.focusVisible() ? this.focused() : null));

  /** The one cell with `tabindex="0"`: where Tab enters the wheel. */
  public readonly tabStop = computed(() => (this.focused() ?? this.primary() ?? ENTRY_CELL).index);

  /** What the caption under the wheel describes: a preview, else the choice. */
  public readonly shown = computed(() => {
    const hovered = this.hovered();
    if (hovered) {
      return { verb: 'Under the cursor', cell: hovered };
    }
    const primary = this.primary();
    return primary ? { verb: 'Primary', cell: primary } : null;
  });

  /**
   * Each marker's rotation, unwrapped against the last one so that crossing
   * twelve o'clock turns the short way. A `linkedSignal` because the value
   * depends on its own history, which a `computed` cannot see.
   */
  private readonly angles = linkedSignal<Triad, Readonly<Record<Role, number>>>({
    source: this.triad,
    computation: (triad, previous) => {
      const angle = (role: Role): number => {
        const cell = triad[role];
        const before = previous?.value[role];
        if (!cell) {
          return before ?? 0;
        }
        return before === undefined || !previous?.source[role] ? cell.h : unwrap(before, cell.h);
      };
      return {
        primary: angle('primary'),
        secondary: angle('secondary'),
        tertiary: angle('tertiary'),
      };
    },
  });

  /** One marker per role that has a colour. */
  public readonly markers = computed(() => {
    const triad = this.triad();
    const angles = this.angles();
    return ROLES.flatMap((role) => {
      const cell = triad[role];
      if (!cell) {
        return [];
      }
      const { inner } = toneRadii(cell.toneIndex);
      return [{ role, cell, angle: angles[role], reach: inner - 3 }];
    });
  });

  /** The figure joining the chosen cells, once there are two to join. */
  public readonly figure = computed(() => {
    const points = ROLES.map((role) => this.triad()[role])
      .filter((cell): cell is ICell => cell !== null)
      .map(cellCentre);
    return points.length < 2
      ? null
      : points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  });

  /** The three cards under the wheel, in role order. */
  public readonly cards = computed(() =>
    ROLES.map((role) => {
      const cell = this.triad()[role];
      return {
        role,
        cell,
        oklch: cell ? oklchText(cell.colour) : '',
        duty: ROLE_DUTIES[role],
        share: Math.round(AREA_SPLIT[role] * 100),
      };
    })
  );

  /** How far round the wheel the accent sits from the ground, in degrees. */
  public readonly accentTurn = computed(() => {
    const a = this.aesthetic();
    return a ? Math.round(angularDistance(a.tertiary.h, a.primary.h)) : 0;
  });

  // ----- Behaviour -----

  public label(cell: ICell): string {
    return `${cell.name}, hue ${cell.h}°`;
  }

  constructor() {
    // The winnowing's tables are built once, on first use. Build them after
    // the wheel has painted rather than inside the first click's frame; the
    // timeout is what lets the paint happen first.
    afterNextRender(() => setTimeout(warm));
  }

  public choosePrimary(cell: ICell): void {
    this.primary.set(cell);
  }

  public onClick(event: MouseEvent): void {
    const cell = this.cellFrom(event);
    if (cell) {
      this.choosePrimary(cell);
    }
  }

  /** A finger has no hover; previewing the cell it lifted from would stick. */
  public onPointerMove(event: PointerEvent): void {
    this.hovered.set(event.pointerType === 'touch' ? null : this.cellFrom(event));
  }

  public onPointerLeave(): void {
    this.hovered.set(null);
  }

  public onFocusIn(event: FocusEvent): void {
    this.focused.set(this.cellOf(event.target));
    this.focusVisible.set(event.target instanceof Element && matchesFocusVisible(event.target));
  }

  public onFocusOut(): void {
    this.focused.set(null);
  }

  public onKeydown(event: KeyboardEvent): void {
    const from = this.cellOf(event.target);
    if (!from) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.choosePrimary(from);
      return;
    }
    const to = step(from, event.key);
    if (!to) {
      return;
    }
    event.preventDefault();
    this.choosePrimary(to);
    this.svg().nativeElement.querySelector<SVGPathElement>(`[data-cell="${to.index}"]`)?.focus();
    // A key moved focus, so it is keyboard focus whatever the engine's
    // heuristic says about a programmatic `focus()`. Set after the call,
    // whose `focusin` would otherwise overwrite it.
    this.focusVisible.set(true);
  }

  /** The cell an event's target is, if it is one. */
  private cellOf(target: EventTarget | null): ICell | null {
    const index = target instanceof Element ? target.getAttribute('data-cell') : null;
    return index === null ? null : CELLS[Number(index)];
  }

  /**
   * The cell an event landed on: its target when that is a cell, otherwise by
   * position, which is how the continuum (a CSS layer under the SVG) answers.
   */
  private cellFrom(event: MouseEvent): ICell | null {
    const direct = this.cellOf(event.target);
    if (direct) {
      return direct;
    }
    const rect = this.svg().nativeElement.getBoundingClientRect();
    if (rect.width === 0) {
      return null;
    }
    const scale = (2 * VIEW_RADIUS) / rect.width;
    return cellAt(
      (event.clientX - rect.left) * scale - VIEW_RADIUS,
      (event.clientY - rect.top) * scale - VIEW_RADIUS
    );
  }
}
