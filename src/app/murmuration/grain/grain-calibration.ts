/** constants which govern the film grain */

/** the most a pixel moves, in display values 0..1, where the grain is heaviest: the shadows */
export const GRAIN_INTENSITY = 0.06;

/** how far the seed steps each frame; the golden ratio's fraction, so no two nearby frames share a pattern */
export const GRAIN_SEED_STEP = 0.618034;
