/**
 * which land a visitor is looking at, said on screen in a sentence, as the dashboard says which transport its
 * figures came from. three states and no fourth: a land is being made in front of the visitor, or it was made
 * earlier by the same model and is shown as one still frame, or made earlier and shown moving.
 *
 * the sentences say what is true today and no more. a storm really is simulated on a device that can, so that
 * one says so and counts its steps. no land is stored yet, so the other two say what the device was found able
 * to do, and the phase that stores a land rewrites them to say what is shown.
 */

export type LandState = 'simulating' | 'still' | 'stored';

/** how far a storm has got, in steps of the model */
export interface IProgress {
  readonly steps: number;
  readonly total: number;
}

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
  simulating: 'A storm is being simulated on this device.',
  still: 'Reduced motion: one still frame of a stored land.',
  stored: 'This device cannot render to 32-bit float, so it is shown a stored land.',
};

const COUNT = new Intl.NumberFormat('en-US');

/**
 * the whole line: the state's sentence, how far the storm has got when there is one, and the seed. steps, not
 * years or hours: the model has no calendar, and a count of its own steps is the one measure of progress it has.
 */
export function landLine(state: LandState, seed: number, progress: IProgress): string {
  const storm =
    state === 'simulating'
      ? ` Step ${COUNT.format(progress.steps)} of ${COUNT.format(progress.total)}.`
      : '';
  return `${LAND_SENTENCES[state]}${storm} Seed ${seed}.`;
}
