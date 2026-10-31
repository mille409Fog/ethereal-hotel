import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GuestProgressStore } from './guest-progress';
import type { IQuest } from './quest-state';

/**
 * A panel's counts: the guest's, large, and the owner's on a line of its own
 * beneath, so the two are never added together or mistaken for each other.
 * Its own component because the page template sits at the cyclomatic cap.
 */
@Component({
  selector: 'app-quest-tally',
  styleUrl: './quest-tally.css',
  templateUrl: './quest-tally.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestTally {
  private readonly guest = inject(GuestProgressStore);

  public readonly quest = input.required<IQuest>();

  public readonly visited = computed((): number => this.guest.visited(this.quest().list).size);
  /** The headline as a percentage, for the bar beneath it. */
  public readonly share = computed(
    (): number => (this.visited() / this.quest().places.length) * 100
  );
  public readonly bonusVisited = computed((): number => this.guest.visited('bonus').size);
  public readonly persistent = this.guest.persistent;

  /** The owner's figures as one clause: "0 of 50 states, and 0 of 6 bonus". */
  public readonly owner = computed((): string => {
    const { owner, ownerBonus, noun } = this.quest();
    const places = `${owner.visited} of ${owner.total} ${noun}`;
    return ownerBonus
      ? `${places}, and ${ownerBonus.visited} of ${ownerBonus.total} bonus`
      : places;
  });
}
