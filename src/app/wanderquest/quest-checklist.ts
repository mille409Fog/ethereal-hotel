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
import type { IPlace } from './places.data';
import type { IQuest } from './quest-state';

/**
 * A name as the filter compares it: case and accents dropped, so "turkiye"
 * finds Türkiye, and surrounding space ignored.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

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

  /** What the guest has typed into the filter, as typed. */
  public readonly query = signal('');

  /** The quest's places whose names match the filter, in their usual order. */
  public readonly shown = computed((): readonly IPlace[] => {
    const needle = fold(this.query());
    const places = this.quest().places;
    return needle ? places.filter((place) => fold(place.name).includes(needle)) : places;
  });

  /** "countries" → "country", "states" → "state": every quest's noun is a regular plural. */
  public readonly singular = computed((): string => {
    const noun = this.quest().noun;
    return noun.endsWith('ies') ? `${noun.slice(0, -3)}y` : noun.replace(/s$/, '');
  });

  /** The live count beside the filter; says plainly when nothing matches. */
  public readonly shownCount = computed((): string => {
    const { places, noun } = this.quest();
    const count = this.shown().length;
    if (count === places.length) {
      return `All ${places.length} ${noun}`;
    }
    return count === 0
      ? `No ${this.singular()} matches “${this.query().trim()}”`
      : `${count} of ${places.length} ${noun}`;
  });

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

  public onFilter(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.query.set(event.target.value);
    }
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
