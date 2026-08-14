/**
 * Solar elevation → the state of the hotel.
 *
 * This is the whole concept compressed into one function. Every room in AUBADE
 * reads its palette, its light rig and its willingness to open from the value
 * this returns; if the rooms ever stop agreeing on it, the piece is six unrelated
 * effects with a hotel painted on, which is the first failure mode the spec
 * records. So it lives alone, in one place, as a pure function of one number.
 *
 * The four boundaries are not aesthetic choices. −18°, −12° and −6° are the
 * astronomical, nautical and civil twilight definitions. −0.833° is the standard
 * definition of sunrise: −0.5667° of atmospheric refraction at the horizon plus
 * the 0.2667° angular radius of the sun, because the day begins when the *upper
 * limb* clears the horizon, not the centre. Getting that right costs one constant
 * and is the sort of detail the piece is made of.
 *
 * Intervals are half-open, lower bound inclusive, so the five states tile the
 * real line exactly once with no gap and no overlap. Exactly −18.0° is `late`;
 * exactly −0.833° is `shuttered`, because at that elevation the sun has, by
 * definition, risen.
 */

/**
 * What the hotel is doing. Ordered darkest to brightest wherever these appear.
 *
 * - `open` — astronomical night. Everything unlocked, everything alive.
 * - `late` — rooms begin closing behind you.
 * - `warning` — nautical twilight; the desk clerk starts mentioning the time.
 * - `aubade` — civil twilight. A countdown to the exact minute of sunrise.
 * - `shuttered` — day. Not a failure state; a second piece, and the invitation
 *   control is on it.
 */
export type AubadeState = 'open' | 'late' | 'warning' | 'aubade' | 'shuttered';

/** Astronomical twilight: below this the sky is as dark as it gets. */
export const ASTRONOMICAL_TWILIGHT_DEGREES = -18;

/** Nautical twilight: the horizon becomes distinguishable at sea. */
export const NAUTICAL_TWILIGHT_DEGREES = -12;

/** Civil twilight: bright enough to read outdoors. */
export const CIVIL_TWILIGHT_DEGREES = -6;

/** Sunrise proper — refraction (0.5667°) plus the solar radius (0.2667°). */
export const SUNRISE_DEGREES = -0.833;

/** The five states, darkest first. The order the elevation ladder walks. */
export const AUBADE_STATES: readonly AubadeState[] = [
  'open',
  'late',
  'warning',
  'aubade',
  'shuttered',
];

/**
 * The state of the hotel at a given solar elevation.
 *
 * @param elevationDegrees Geometric solar elevation above the horizon, degrees.
 *   Negative below the horizon. Comes from `solarElevation` in
 *   `solar-position.ts`, uncorrected for refraction — the thresholds above
 *   already account for it.
 * @returns One of the five states, for any input including a non-finite one.
 */
export function stateForElevation(elevationDegrees: number): AubadeState {
  // We use a simple one to one mapping.
  if (elevationDegrees < ASTRONOMICAL_TWILIGHT_DEGREES) {
    return 'open';
  }
  if (elevationDegrees < NAUTICAL_TWILIGHT_DEGREES) {
    return 'late';
  }
  if (elevationDegrees < CIVIL_TWILIGHT_DEGREES) {
    return 'warning';
  }
  if (elevationDegrees < SUNRISE_DEGREES) {
    return 'aubade';
  }
  // Shuttered if we reach an unforeseen case, handles edge cases and the natural shuttering condition.
  return 'shuttered';
}
