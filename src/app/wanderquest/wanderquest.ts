import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { GuestProgressStore } from './guest-progress';
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
  imports: [QuestChecklist, QuestTally],
  providers: [GuestProgressStore],
  styleUrl: './wanderquest.css',
  templateUrl: './wanderquest.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Wanderquest {
  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  public readonly guest = inject(GuestProgressStore);

  public readonly quests = QUESTS;

  /** The quest on screen. */
  public readonly quest = signal(QUEST_STATE.STATES);

  public readonly current = computed(
    (): IQuest => QUESTS.find((quest) => quest.id === this.quest()) ?? QUESTS[0]
  );

  public onSelection(selection: QUEST_STATE): void {
    this.quest.set(selection);
  }

  /**
   * A click on a drawn place toggles it, exactly as its checkbox would. The
   * listener is on the outline rather than on each path, so it reads the place
   * from the `data-id` the paths already carry; a click on the ground between
   * them, or on unkeyed land, finds none and does nothing: unkeyed land is
   * none of the places, so it is never selectable.
   */
  public onMapClick(event: MouseEvent, quest: IQuest): void {
    if (!(event.target instanceof Element)) {
      return;
    }
    const id = event.target.closest('path[data-id]')?.getAttribute('data-id');
    if (id) {
      this.guest.toggle(quest.list, id);
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
