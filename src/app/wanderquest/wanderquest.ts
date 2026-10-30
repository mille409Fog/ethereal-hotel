import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { GuestProgressStore, type GuestList } from './guest-progress';
import { QuestBonusMap } from './quest-bonus-map';
import { QuestChecklist } from './quest-checklist';
import { QUEST_STATE, QUESTS, stepQuest, type IQuest } from './quest-state';
import { QuestTally } from './quest-tally';

/**
 * Three travel quests behind a WAI-ARIA tablist. Selection follows focus: the
 * panels are already rendered, so there is no cost to showing one the moment
 * an arrow key reaches its tab. The view is a signal and is not persisted; the
 * guest's marks are, by `GuestProgressStore`, which the page provides so each
 * visit reads storage afresh.
 */
@Component({
  selector: 'app-wanderquest',
  imports: [QuestBonusMap, QuestChecklist, QuestTally],
  providers: [GuestProgressStore],
  styleUrl: './wanderquest.css',
  templateUrl: './wanderquest.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Wanderquest {
  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  public readonly guest = inject(GuestProgressStore);

  public readonly quests = QUESTS;

  /**
   * Each quest's place names by id, for the `<title>` on its outline's shapes.
   * Taken from the quest's own places, so a tooltip cannot name a place the
   * checklist calls something else.
   */
  public readonly placeNames: ReadonlyMap<QUEST_STATE, ReadonlyMap<string, string>> = new Map(
    QUESTS.map((quest) => [quest.id, new Map(quest.places.map((place) => [place.id, place.name]))])
  );

  /** The quest on screen. */
  public readonly quest = signal(QUEST_STATE.STATES);

  public readonly current = computed(
    (): IQuest => QUESTS.find((quest) => quest.id === this.quest()) ?? QUESTS[0]
  );

  public onSelection(selection: QUEST_STATE): void {
    this.quest.set(selection);
  }

  /**
   * A click on a drawn place toggles it in `list`, exactly as its checkbox
   * would. `list` is the one the clicked map draws, not the quest's: the
   * states panel holds two maps, and the bonus map's clicks are `bonus`.
   *
   * The listener is on the map rather than on each place, so it reads the
   * place from the nearest `data-id`: a path's on the outlines, a whole tile's
   * on the bonus map. A click on the ground between them, or on unkeyed land,
   * finds none and does nothing: unkeyed land is none of the places, so it is
   * never selectable. The store ignores an id that is not in `list`, so one
   * map can never write to another's.
   */
  public onMapClick(event: MouseEvent, list: GuestList): void {
    if (!(event.target instanceof Element)) {
      return;
    }
    const id = event.target.closest('[data-id]')?.getAttribute('data-id');
    if (id) {
      this.guest.toggle(list, id);
    }
  }

  /**
   * Steps from the tab the key was pressed on, not from the selection: the two
   * differ whenever focus reaches a tab without selecting it, and an arrow key
   * must move from where the user is.
   */
  public onKeydown(event: KeyboardEvent, from: QUEST_STATE): void {
    const to = stepQuest(from, event.key);
    if (!to) {
      return;
    }
    event.preventDefault();
    this.onSelection(to);
    const index = QUESTS.findIndex((quest) => quest.id === to);
    this.tabs()[index]?.nativeElement.focus();
  }
}
