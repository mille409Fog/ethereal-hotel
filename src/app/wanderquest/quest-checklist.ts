import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
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
  imports: [NgTemplateOutlet],
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

  /**
   * The place whose row the pointer is over or focus is in, and null when it
   * leaves. Handed up rather than drawn here: the page owns the one signal the
   * outline reads, so the list never reaches into the map. Only the quest's
   * own rows say it, because the bonus places are not on the outline.
   */
  public readonly highlight = output<string | null>();

  /** True while the clear control is waiting for an answer. */
  public readonly asking = signal(false);

  /** What the guest has typed into the filter, as typed. */
  public readonly query = signal('');

  /**
   * Places unticked from the short list since the search last changed. They
   * stay on it, unticked, so the row under the guest's focus never vanishes
   * the moment they change their mind, and ticking it again is one key away.
   */
  private readonly kept = signal<ReadonlySet<string>>(new Set());

  /** The quest's places whose names match the filter; none while it is empty. */
  private readonly matches = computed((): readonly IPlace[] => {
    const needle = fold(this.query());
    return needle ? this.quest().places.filter((place) => fold(place.name).includes(needle)) : [];
  });

  /**
   * The rows above the full list, in their usual order. A short quest shows
   * every place. A searchable one shows only what the guest has visited and
   * what the search matches — 195 rows on a phone was a page 7,900px tall —
   * and leaves the whole alphabet to the disclosure under it.
   */
  public readonly shown = computed((): readonly IPlace[] => {
    const { places, list, filterable } = this.quest();
    if (!filterable) {
      return places;
    }
    const visited = this.guest.visited(list);
    const kept = this.kept();
    const matched = new Set(this.matches().map((place) => place.id));
    return places.filter(
      (place) => visited.has(place.id) || kept.has(place.id) || matched.has(place.id)
    );
  });

  /** "countries" → "country", "states" → "state": every quest's noun is a regular plural. */
  public readonly singular = computed((): string => {
    const noun = this.quest().noun;
    return noun.endsWith('ies') ? `${noun.slice(0, -3)}y` : noun.replace(/s$/, '');
  });

  /**
   * The live count beside the filter: how many places the search matches, and
   * plainly when none does. Silent while the search is empty, because the
   * tally above already says how many are marked.
   */
  public readonly shownCount = computed((): string => {
    const query = this.query().trim();
    if (!query) {
      return '';
    }
    const count = this.matches().length;
    if (count === 0) {
      return `No ${this.singular()} matches “${query}”`;
    }
    return count === 1
      ? `1 ${this.singular()} matches “${query}”`
      : `${count} ${this.quest().noun} match “${query}”`;
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

  /** `keep` is true for a row of the short list, which then stays on it. */
  public onToggle(list: GuestList, id: string, keep = false): void {
    if (keep) {
      this.kept.update((kept) => new Set(kept).add(id));
    }
    this.guest.toggle(list, id);
  }

  public onFilter(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.query.set(event.target.value);
      this.kept.set(new Set());
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
      this.kept.set(new Set());
    }
    this.asking.set(false);
    this.focusAfterRender(() => this.clearButton());
  }

  /** The button that should hold focus exists only once the swap has rendered. */
  private focusAfterRender(target: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }
}
