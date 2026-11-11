/**
 * which land a visitor is looking at, said on screen in a sentence, as the dashboard says which transport its
 * figures came from. three states and no fourth: a land is being made in front of the visitor, or it was made
 * earlier by the same model and is shown as one still frame, or made earlier and shown moving.
 *
 * the sentences are this phase's. nothing is simulated yet, so they say what the device can do and what it will
 * be shown, and do not claim a storm is running; the phase that stores a land rewrites them.
 */

export type LandState = 'simulating' | 'still' | 'stored';

/**
 * reduced motion wins over capability: a visitor who asked for stillness gets the still frame whether or not
 * their device could have run the storm.
 */
export function landStateFor(reducedMotion: boolean, floatTargets: boolean): LandState {
  if (reducedMotion) {
    return 'still';
  }
  return floatTargets ? 'simulating' : 'stored';
}

/** true when the land shown is the stored one, which is always the hero seed's */
export function showsStoredLand(state: LandState): boolean {
  return state !== 'simulating';
}

export const LAND_SENTENCES: Readonly<Record<LandState, string>> = {
  simulating: 'This device can run the simulation.',
  still: 'Reduced motion: one still frame of a stored land.',
  stored: 'This device cannot render to 32-bit float, so it is shown a stored land.',
};
