/**
 * A guest's own progress, kept in their own browser and nowhere else.
 *
 * The owner's record is `progress.data.ts`, a commit; this is the other half,
 * and the two never meet: a guest starts empty and is never seeded from the
 * owner, and nothing here is sent anywhere — no backend call, no analytics
 * event. `docs/analytics.md` says what is stored and why it needs no consent.
 *
 * Storage is one versioned key holding all four lists, so a later change of
 * shape bumps the version and an old value reads as empty rather than as
 * something it no longer means. The value is the visitor's to edit, so it is
 * read as untrusted: bad JSON, a wrong shape, or an id `places.data.ts` does
 * not list is dropped rather than counted.
 *
 * Every storage call is wrapped. Storage can be missing (a blocked cookie
 * setting makes merely touching `window.localStorage` throw), can refuse a
 * read, or can refuse a write (Safari's old private mode, a full quota). In
 * each case the marks still work for the visit and `persistent` goes false so
 * the page can say they will not be kept.
 */
import { inject, Injectable, InjectionToken, signal, type Signal } from '@angular/core';
import { BONUS, CONTINENTS, COUNTRIES, STATES, type IPlace } from './places.data';
import type { IProgress } from './progress.data';

/** Bump the version whenever the stored shape changes meaning. */
export const GUEST_PROGRESS_KEY = 'wanderquest.guest.v1';

/** One of the four lists a guest can mark: a quest's places, or the bonus. */
export type GuestList = keyof IProgress;

/** A guest's marks, one set of ids per list. */
export type GuestProgress = Readonly<Record<GuestList, ReadonlySet<string>>>;

const PLACES: Readonly<Record<GuestList, readonly IPlace[]>> = {
  states: STATES,
  bonus: BONUS,
  continents: CONTINENTS,
  countries: COUNTRIES,
};

const LISTS = Object.keys(PLACES) as GuestList[];

/** The ids each list accepts; anything else in storage is not a place. */
const KNOWN: Readonly<Record<GuestList, ReadonlySet<string>>> = {
  states: new Set(STATES.map((place) => place.id)),
  bonus: new Set(BONUS.map((place) => place.id)),
  continents: new Set(CONTINENTS.map((place) => place.id)),
  countries: new Set(COUNTRIES.map((place) => place.id)),
};

export function emptyProgress(): GuestProgress {
  return { states: new Set(), bonus: new Set(), continents: new Set(), countries: new Set() };
}

/**
 * Reads a stored value back, keeping only what is a known place in the list
 * it was filed under. Never throws: anything unreadable is an empty record.
 * Ids are kept in `places.data.ts` order, so a reload lists them the same way.
 */
export function parseProgress(raw: string | null): GuestProgress {
  if (raw === null) {
    return emptyProgress();
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return emptyProgress();
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return emptyProgress();
  }
  const record = value as Partial<Record<GuestList, unknown>>;
  const read = (list: GuestList): ReadonlySet<string> => {
    const ids = record[list];
    if (!Array.isArray(ids)) {
      return new Set();
    }
    const stored = new Set(ids.filter((id): id is string => typeof id === 'string'));
    return new Set(PLACES[list].map((place) => place.id).filter((id) => stored.has(id)));
  };
  return {
    states: read('states'),
    bonus: read('bonus'),
    continents: read('continents'),
    countries: read('countries'),
  };
}

export function serializeProgress(progress: GuestProgress): string {
  return JSON.stringify(Object.fromEntries(LISTS.map((list) => [list, [...progress[list]]])));
}

/**
 * The browser's `localStorage`, or null where touching it throws. A token so
 * the specs can hand over storage that refuses.
 */
export const GUEST_STORAGE = new InjectionToken<Storage | null>('GUEST_STORAGE', {
  providedIn: 'root',
  factory: (): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  },
});

/**
 * The guest's marks as signals, read from storage once when the page opens and
 * written back on every change. Provided by the page, not the root, so each
 * visit to the route reads storage afresh.
 */
@Injectable()
export class GuestProgressStore {
  private readonly storage = inject(GUEST_STORAGE);
  private readonly progress = signal<GuestProgress>(emptyProgress());
  private readonly kept = signal(true);

  /** False once storage has refused anything: marks last for this visit only. */
  public readonly persistent: Signal<boolean> = this.kept.asReadonly();

  constructor() {
    if (!this.storage) {
      this.kept.set(false);
      return;
    }
    try {
      this.progress.set(parseProgress(this.storage.getItem(GUEST_PROGRESS_KEY)));
    } catch {
      this.kept.set(false);
    }
  }

  public visited(list: GuestList): ReadonlySet<string> {
    return this.progress()[list];
  }

  public has(list: GuestList, id: string): boolean {
    return this.progress()[list].has(id);
  }

  /** Marks a place visited, or unmarks it. An id the list does not hold is ignored. */
  public toggle(list: GuestList, id: string): void {
    if (!KNOWN[list].has(id)) {
      return;
    }
    const next = new Set(this.progress()[list]);
    if (!next.delete(id)) {
      next.add(id);
    }
    this.save({ ...this.progress(), [list]: next });
  }

  /** Unmarks everything in the given lists. */
  public clear(lists: readonly GuestList[]): void {
    const next: Record<GuestList, ReadonlySet<string>> = { ...this.progress() };
    for (const list of lists) {
      next[list] = new Set();
    }
    this.save(next);
  }

  private save(next: GuestProgress): void {
    this.progress.set(next);
    if (!this.storage) {
      return;
    }
    try {
      this.storage.setItem(GUEST_PROGRESS_KEY, serializeProgress(next));
    } catch {
      this.kept.set(false);
    }
  }
}
