import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  signal,
  viewChildren,
} from '@angular/core';
import { QUEST_STATE, QUESTS, stepQuest, type IQuest } from './quest-state';

/**
 * Three travel quests behind a WAI-ARIA tablist. Selection follows focus: the
 * panels are already rendered, so there is no cost to showing one the moment
 * an arrow key reaches its tab. The view is a signal and nothing is persisted.
 */
@Component({
  selector: 'app-wanderquest',
  styleUrl: './wanderquest.css',
  templateUrl: './wanderquest.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Wanderquest {
  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  public readonly quests = QUESTS;

  /** The quest on screen. */
  public readonly quest = signal(QUEST_STATE.STATES);

  public readonly current = computed(
    (): IQuest => QUESTS.find((quest) => quest.id === this.quest()) ?? QUESTS[0]
  );

  public onSelection(selection: QUEST_STATE): void {
    this.quest.set(selection);
  }

  public onKeydown(event: KeyboardEvent): void {
    const to = stepQuest(this.quest(), event.key);
    if (!to) {
      return;
    }
    event.preventDefault();
    this.onSelection(to);
    const index = QUESTS.findIndex((quest) => quest.id === to);
    this.tabs()[index]?.nativeElement.focus();
  }
}
