/**
 * The three quests the selector chooses between, and what each panel counts.
 *
 * Every figure here is a length taken from `places.data.ts` or
 * `progress.data.ts`, never a literal, so the panel cannot say 195 while the
 * list holds 194. No Angular imports: the keyboard rule is a pure function so
 * the spec can walk it without a fixture.
 */
import { BONUS, CONTINENTS, COUNTRIES, STATES } from './places.data';
import { OWNER_PROGRESS } from './progress.data';

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
  /** The tab's text, and the noun after the count. */
  readonly label: string;
  readonly tally: ITally;
  /** DC and the territories; only the states quest has a bonus, and it is not required. */
  readonly bonus: ITally | null;
}

/** The quests in tab order. Arrow keys walk this order and wrap. */
export const QUESTS: readonly IQuest[] = [
  {
    id: QUEST_STATE.STATES,
    label: 'states',
    tally: { visited: OWNER_PROGRESS.states.length, total: STATES.length },
    bonus: { visited: OWNER_PROGRESS.bonus.length, total: BONUS.length },
  },
  {
    id: QUEST_STATE.CONTINENTS,
    label: 'continents',
    tally: { visited: OWNER_PROGRESS.continents.length, total: CONTINENTS.length },
    bonus: null,
  },
  {
    id: QUEST_STATE.COUNTRIES,
    label: 'countries',
    tally: { visited: OWNER_PROGRESS.countries.length, total: COUNTRIES.length },
    bonus: null,
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
