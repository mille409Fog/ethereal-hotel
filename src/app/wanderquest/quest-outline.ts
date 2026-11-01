import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
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

  /** Each place's name by id, for the `<title>` on its shape. */
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
   * The rectangles that tie an inset to its outline: on the outline, the part
   * the inset enlarges; on the inset, its own frame. The same rectangle at two
   * scales, which is what lets the two read as one place.
   */
  public readonly frames = computed((): IOutlineRect[] => {
    const outline = this.outline();
    const enlarged = this.inset()?.enlarges;
    return [...(outline.enlarges ? [frameOf(outline)] : []), ...(enlarged ? [enlarged] : [])];
  });
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
