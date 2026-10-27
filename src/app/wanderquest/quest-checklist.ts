import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { GuestProgressStore, type GuestList } from './guest-progress';
import type { IQuest } from './quest-state';

/**
 * The control a guest marks places with: one native checkbox per place and
 * per bonus place, bound to the same store the map is drawn from. The map
 * takes no focus, so this list is the whole keyboard and screen-reader route,
 * and the answer to a state too small to hit on a phone.
 */
@Component({
  selector: 'app-quest-checklist',
  styleUrl: './quest-checklist.css',
  templateUrl: './quest-checklist.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestChecklist {
  private readonly guest = inject(GuestProgressStore);
  private readonly injector = inject(Injector);
  private readonly clearButton = viewChild<ElementRef<HTMLButtonElement>>('clear');
  private readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keep');

  public readonly quest = input.required<IQuest>();

  /** True while the clear control is waiting for an answer. */
  public readonly asking = signal(false);

  /** The lists the clear control empties: the quest's own, and its bonus if it has one. */
  private readonly lists = computed((): readonly GuestList[] => {
    const quest = this.quest();
    return quest.bonusPlaces ? [quest.list, 'bonus'] : [quest.list];
  });

  public readonly marked = computed((): number =>
    this.lists().reduce((sum, list) => sum + this.guest.visited(list).size, 0)
  );

  public readonly question = computed((): string => {
    const count = this.marked();
    return `Clear the ${count} ${count === 1 ? 'place' : 'places'} you have marked? This cannot be undone.`;
  });

  public isVisited(list: GuestList, id: string): boolean {
    return this.guest.has(list, id);
  }

  public onToggle(list: GuestList, id: string): void {
    this.guest.toggle(list, id);
  }

  /** Asks first: a guest's marks exist nowhere else, so a slip would lose them. */
  public onAsk(): void {
    if (this.marked() === 0) {
      return;
    }
    this.asking.set(true);
    this.focusAfterRender(() => this.keepButton());
  }

  public onAnswer(clear: boolean): void {
    if (clear) {
      this.guest.clear(this.lists());
    }
    this.asking.set(false);
    this.focusAfterRender(() => this.clearButton());
  }

  /** The button that should hold focus exists only once the swap has rendered. */
  private focusAfterRender(target: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }
}
