/**
 * Jacob's own progress, committed rather than stored.
 *
 * The owner's record is a file because the alternatives each broke a rule the
 * rest of the site keeps: a login is on ROADMAP's "Deliberately not doing"
 * list, and the production database is rebuilt in `/tmp` on every cold start,
 * so a write there would not outlive the function. Publishing a place is a
 * commit, and the git history is the record of when it was added.
 *
 * A guest's progress never comes here; it lives in their own browser. Each id
 * is typed against `places.data.ts`, so a place that does not exist cannot be
 * listed. Filled in by hand — nothing here is guessed.
 */
import type { BonusId, ContinentId, CountryId, StateId } from './places.data';

/** Visited places, one list per quest plus the bonus category. */
export interface IProgress {
  readonly states: readonly StateId[];
  readonly bonus: readonly BonusId[];
  readonly continents: readonly ContinentId[];
  readonly countries: readonly CountryId[];
}

export const OWNER_PROGRESS: IProgress = {
  // All fifty.
  states: [
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'FL',
    'GA',
    'HI',
    'ID',
    'IL',
    'IN',
    'IA',
    'KS',
    'KY',
    'LA',
    'ME',
    'MD',
    'MA',
    'MI',
    'MN',
    'MS',
    'MO',
    'MT',
    'NE',
    'NV',
    'NH',
    'NJ',
    'NM',
    'NY',
    'NC',
    'ND',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VT',
    'VA',
    'WA',
    'WV',
    'WI',
    'WY',
  ],
  bonus: [],
  continents: ['AS', 'EU', 'NA', 'OC'],
  countries: [],
};
