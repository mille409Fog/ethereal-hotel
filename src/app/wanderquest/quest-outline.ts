import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { GuestProgressStore, type GuestList } from './guest-progress';
import type { IOutline, IOutlineRect } from './outline';

/**
 * One quest outline: the places of `list`, each filled by the guest's marks
 * and lit by the checklist row pointing at it. A panel can draw more than one
 * of a list, the countries as the world and again as Europe enlarged, and
 * each reads the same store and the same highlight, so a mark or a row shows
 * on every drawing of its place at once. Its own component because the page
 * template sits at the cyclomatic cap, which a second outline would cross.
 */
@Component({
  selector: 'app-quest-outline',
  styleUrl: './quest-outline.css',
  templateUrl: './quest-outline.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestOutline {
  public readonly guest = inject(GuestProgressStore);

  public readonly outline = input.required<IOutline>();

  /** The list the outline's places are marked in. */
  public readonly list = input.required<GuestList>();

  /** Each place's name by id, for the caption under the outline. */
  public readonly names = input.required<ReadonlyMap<string, string> | undefined>();

  /** The id a checklist row is lighting in this list, if any. */
  public readonly highlighted = input<string | null>(null);

  /** An inset of this outline, whose rectangle is marked on it. */
  public readonly inset = input<IOutline | null>(null);

  /**
   * A click anywhere on the map, handed up as the bonus map's is, so the
   * page's one `onMapClick` decides what a click on any map means.
   */
  public readonly mapClick = output<MouseEvent>();

  /**
   * The place the pointer is over, or on a touch screen the one last tapped.
   * Linked to the row highlight so that whichever moved last is the one the
   * caption names: a tapped place would otherwise outlive the tap, and hide
   * the checkbox the guest has since focused.
   */
  public readonly pointed = linkedSignal<string | null, string | null>({
    source: this.highlighted,
    computation: () => null,
  });

  private readonly drawn = computed(
    (): ReadonlySet<string> => new Set(this.outline().shapes.map((shape) => shape.id))
  );

  /**
   * The line under the outline: the place being pointed at and its state, or
   * nothing. A row can light a place this drawing does not hold, a country
   * outside Europe's inset or one too small to draw, and the caption under a
   * map names only what is on it.
   */
  public readonly caption = computed((): string => {
    const id = this.pointed() ?? this.highlighted();
    if (id === null || !this.drawn().has(id)) {
      return '';
    }
    const state = this.guest.has(this.list(), id) ? 'visited' : 'not yet visited';
    return `${this.names()?.get(id) ?? id} — ${state}`;
  });

  /**
   * The rectangles that tie an inset to its outline: on the outline, the part
   * the inset enlarges; on the inset, its own frame. The same rectangle at two
   * scales, which is what lets the two read as one place.
   */
  public readonly frames = computed((): IOutlineRect[] => {
    const outline = this.outline();
    const enlarged = this.inset()?.enlarges;
    return [...(outline.enlarges ? [frameOf(outline)] : []), ...(enlarged ? [enlarged] : [])];
  });

  /**
   * A mouse or pen names what it passes over. A finger is left to `onPointerUp`,
   * because a touch that becomes a scroll passes over places it never toggles.
   */
  public onPointerOver(event: PointerEvent): void {
    if (event.pointerType !== 'touch') {
      this.pointed.set(placeAt(event.target));
    }
  }

  /** A finger lifting from a place is the tap that toggles it, so it names it. */
  public onPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      this.pointed.set(placeAt(event.target));
    }
  }

  /** A pointer leaving empties the line; a tap's answer stays until the next. */
  public onPointerLeave(event: PointerEvent): void {
    if (event.pointerType !== 'touch') {
      this.pointed.set(null);
    }
  }
}

/**
 * The keyed place an event landed on, read from `data-id` as the page's
 * `onMapClick` reads it, or null for the ground and the unkeyed land.
 */
function placeAt(target: EventTarget | null): string | null {
  return target instanceof Element ? target.getAttribute('data-id') : null;
}

/**
 * An inset's own frame. The script draws it from the origin and leaves the
 * same margin on every side, `viewBox` "-m -m w+2m h+2m", so the frame's
 * stroke is not cut in half at the edge; this takes the margin back off.
 */
export function frameOf(outline: IOutline): IOutlineRect {
  const [x, y, width, height] = outline.viewBox.split(' ').map(Number);
  return { x: 0, y: 0, width: width + 2 * x, height: height + 2 * y };
}
