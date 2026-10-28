/**
 * The three quests the selector chooses between, and what each panel counts.
 *
 * Every figure here is a length taken from `places.data.ts` or
 * `progress.data.ts`, never a literal, so the panel cannot say 195 while the
 * list holds 194. No Angular imports: the keyboard rule is a pure function so
 * the spec can walk it without a fixture.
 */
import { BONUS_OUTLINE } from './bonus.outline';
import { CONTINENTS_OUTLINE } from './continents.outline';
import { COUNTRIES_OUTLINE } from './countries.outline';
import type { GuestList } from './guest-progress';
import type { IOutline } from './outline';
import { BONUS, CONTINENTS, COUNTRIES, STATES, type IPlace } from './places.data';
import { OWNER_PROGRESS } from './progress.data';
import { STATES_OUTLINE } from './states.outline';

/** used to store the selected quest mode */
export enum QUEST_STATE {
  STATES = 'states',
  CONTINENTS = 'continents',
  COUNTRIES = 'countries',
}

/** A tally of one list: how many places it has, and how many are visited. */
export interface ITally {
  readonly visited: number;
  readonly total: number;
}

/** One quest as its tab and panel show it. */
export interface IQuest {
  readonly id: QUEST_STATE;
  /** The tab's text, title-cased as a label. */
  readonly label: string;
  /** The noun after the count, lower-case mid-sentence: "0 of 50 states visited". */
  readonly noun: string;
  /** The list a guest's marks for this quest are stored under. */
  readonly list: Exclude<GuestList, 'bonus'>;
  /** The places the quest counts; the guest's tally is out of these. */
  readonly places: readonly IPlace[];
  /** DC and the territories; only the states quest has a bonus, and it is not required. */
  readonly bonusPlaces: readonly IPlace[] | null;
  /** The owner's committed figures, shown on a line of their own and never mixed with a guest's. */
  readonly owner: ITally;
  readonly ownerBonus: ITally | null;
  /**
   * Whether the checklist gets a filter. Fifty states scan as a block; 195
   * countries are a wall, so only that list is searched.
   */
  readonly filterable: boolean;
  /** The rough contours of the quest's map, or null until its outline is built. */
  readonly outline: IOutline | null;
  /** The bonus places as small multiples, one tile each; only the states quest has them. */
  readonly bonusOutline: IOutline | null;
}

/** The quests in tab order. Arrow keys walk this order and wrap. */
export const QUESTS: readonly IQuest[] = [
  {
    id: QUEST_STATE.STATES,
    label: 'States',
    noun: 'states',
    list: 'states',
    places: STATES,
    bonusPlaces: BONUS,
    owner: { visited: OWNER_PROGRESS.states.length, total: STATES.length },
    ownerBonus: { visited: OWNER_PROGRESS.bonus.length, total: BONUS.length },
    filterable: false,
    outline: STATES_OUTLINE,
    bonusOutline: BONUS_OUTLINE,
  },
  {
    id: QUEST_STATE.CONTINENTS,
    label: 'Continents',
    noun: 'continents',
    list: 'continents',
    places: CONTINENTS,
    bonusPlaces: null,
    owner: { visited: OWNER_PROGRESS.continents.length, total: CONTINENTS.length },
    ownerBonus: null,
    filterable: false,
    outline: CONTINENTS_OUTLINE,
    bonusOutline: null,
  },
  {
    id: QUEST_STATE.COUNTRIES,
    label: 'Countries',
    noun: 'countries',
    list: 'countries',
    places: COUNTRIES,
    bonusPlaces: null,
    owner: { visited: OWNER_PROGRESS.countries.length, total: COUNTRIES.length },
    ownerBonus: null,
    filterable: true,
    outline: COUNTRIES_OUTLINE,
    bonusOutline: null,
  },
];

/**
 * Which quest a key moves the tablist to from `current`, or null for a key the
 * tablist does not use. Left and right wrap, Home and End go to the ends —
 * the WAI-ARIA tabs pattern for a horizontal tablist.
 */
export function stepQuest(current: QUEST_STATE, key: string): QUEST_STATE | null {
  const index = QUESTS.findIndex((quest) => quest.id === current);
  const at = (i: number): QUEST_STATE => QUESTS[(i + QUESTS.length) % QUESTS.length].id;

  switch (key) {
    case 'ArrowRight':
      return at(index + 1);
    case 'ArrowLeft':
      return at(index - 1);
    case 'Home':
      return at(0);
    case 'End':
      return at(QUESTS.length - 1);
    default:
      return null;
  }
}
