import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { GuestProgressStore } from './guest-progress';
import type { IOutlineTile } from './outline';
import type { IQuest } from './quest-state';

/** The most characters a line of a tile's name holds at the size the panel sets. */
const NAME_LINE = 16;

/** One tile as the template draws it: its square, its land and its name in lines. */
export interface IBonusTile extends IOutlineTile {
  readonly d: string;
  readonly lines: readonly string[];
}

/**
 * `name` broken into lines of at most `NAME_LINE` characters, at spaces. A
 * word longer than a line gets one to itself rather than being split.
 */
export function nameLines(name: string): string[] {
  const lines: string[] = [];
  for (const word of name.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= NAME_LINE) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

/**
 * DC and the five inhabited territories as small multiples, under the states
 * outline. No one scale can hold them: they are scattered across two oceans
 * and differ in size by orders of magnitude, so each tile is fitted to its own
 * place and the panel says so beneath. A marked place is filled in the
 * panel's bonus colour, not its visited one, so the key's "Bonus, visited"
 * swatch describes what is on screen. Its own component because the page
 * template sits at the cyclomatic cap.
 */
@Component({
  selector: 'app-quest-bonus-map',
  styleUrl: './quest-bonus-map.css',
  templateUrl: './quest-bonus-map.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestBonusMap {
  public readonly guest = inject(GuestProgressStore);

  public readonly quest = input.required<IQuest>();

  /**
   * A click anywhere on the map, handed up rather than handled here, so the
   * page's one `onMapClick` decides what a click on any map means and this
   * component only says which list it draws.
   */
  public readonly mapClick = output<MouseEvent>();

  public readonly tiles = computed((): IBonusTile[] => {
    const { bonusOutline, bonusPlaces } = this.quest();
    const shapes = new Map(bonusOutline?.shapes.map((shape) => [shape.id, shape.d]));
    return (bonusOutline?.tiles ?? []).map((tile) => ({
      ...tile,
      d: shapes.get(tile.id) ?? '',
      lines: nameLines(bonusPlaces?.find((place) => place.id === tile.id)?.name ?? tile.id),
    }));
  });

  /** The tiles that draw only part of their place, named, for the note under the map. */
  public readonly partial = computed((): Array<{ id: string; name: string; partial: string }> =>
    this.tiles().flatMap(({ id, lines, partial }) =>
      partial ? [{ id, name: lines.join(' '), partial }] : []
    )
  );
}
