/**
 * which land a visitor is looking at, said on screen in a sentence, as the dashboard says which transport its
 * figures came from. three states and no fourth: a land is being made in front of the visitor, or it was made
 * earlier by the same model and is shown as one still frame, or made earlier and shown moving.
 *
 * the sentences say what is true and no more. a storm really is simulated on a device that can, so that one says
 * so. the other two say why the visitor is not watching one, and that what they are shown was computed earlier by
 * the same model, which it was: `public/watershed-land.png` is the reference model's own storm for the hero seed
 * (`scripts/build-watershed-land.mjs`), and the seed is named after the sentence. that clause is the whole
 * difference between a fallback and a fake.
 *
 * a line that says a land is shown appears only once it has been drawn, and a stored land that could not be
 * fetched says so instead of claiming one.
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
  simulating: 'A storm is being simulated on this device.',
  still: 'Reduced motion: one still frame of a land computed earlier by the same model.',
  stored:
    'This device cannot render to 32-bit float, so it is shown a land computed earlier by the same model.',
};

/** said after the sentence while a storm, or a stored land's pass, is held */
export const PAUSED = 'Paused.';

/** said in place of the line when the stored land could not be fetched or decoded: there is no land to name */
export const UNLOADED = 'The stored land could not be loaded, so no land is shown.';

/**
 * the canvas's own name, for a screen reader: what the picture is of, where the line says where it came from. a
 * canvas is opaque to assistive technology, so without this the largest thing on the page is announced as nothing.
 * it claims only what is drawn: before the first frame, and when the stored land could not be loaded, that is no land.
 */
export const LAND_PICTURES: Readonly<Record<LandState, string>> = {
  simulating: 'A block of land eroding under a storm as the simulation runs.',
  still: 'One still frame of a block of land the model eroded, standing in cloud.',
  stored: 'A block of land the model eroded, flown over by the camera.',
};

/** the canvas's name while it holds no land: before the first frame, or when the stored land failed to load */
export const NO_PICTURE = 'No land is drawn.';

export function landPicture(state: LandState | null, unloaded: boolean): string {
  return state === null || unloaded ? NO_PICTURE : LAND_PICTURES[state];
}

/** true for a state the visitor can pause: anything that moves */
export function pausable(state: LandState): boolean {
  return state !== 'still';
}

/**
 * the whole line: the state's sentence, whether it is paused, and the seed. how far the storm has got is the
 * readout's to say (`direction/readout.ts`), in steps and not in years or hours: the model has no calendar.
 */
export function landLine(state: LandState, seed: number, paused = false): string {
  const held = pausable(state) && paused ? ` ${PAUSED}` : '';
  return `${LAND_SENTENCES[state]}${held} Seed ${seed}.`;
}
