/** constants which govern the colour grade */
import { PALETTE } from '../batoid/batoid-calibration';

/** the grade's tints come out of the palette rather than being picked again, so the shadows cool toward the same
 *  indigo the zenith is painted and the highlights warm toward the same sun that lights the bats */
export const GRADE = {
  shadowTint: PALETTE.zenith,
  /** how far black lifts toward the shadow tint; 0 leaves black black */
  shadowStrength: 0.08,
  highlightTint: PALETTE.sun,
  /** how far white is pulled toward the highlight tint; 0 leaves white white */
  highlightStrength: 0.06,
  /** above 1 opens the midtones, below 1 deepens them; 1 leaves them where the tone mapping put them */
  gamma: 1,
} as const;
