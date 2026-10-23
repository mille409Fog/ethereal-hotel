/** constants used to calibrate where the camera is placed and how it operates */

/** a longer lens than a phone's, so depth flattens the way it does in telephoto nature footage; the camera stands
 *  further back to keep the cauldron in frame */
export const CAMERA_VERTICAL_FOV: number = 35;
/** the narrowest the view may be from side to side, in degrees. a landscape frame is wider than this at
 *  CAMERA_VERTICAL_FOV; a portrait phone is not, so there the vertical view opens until the flock fits across */
export const CAMERA_MIN_HORIZONTAL_FOV: number = 45;
export const CAMERA_NEAR: number = 0.1;
export const CAMERA_FAR: number = 100;
/** below the flock and looking up into it, so bats are seen against the sky rather than edge-on, and the low sun
 *  sits near the foot of the frame with the shafts rising through them. far enough out that the whole mass, about
 *  4.8 across and 2.4 tall once homing has shaped it, fits the frame with sky around it even when the orbit
 *  breathes in; nearer, the flock filled the frame and ran off its foot.
 *  note that we are using a camera loop, so this describes the initial point rather than a constant point */
export const CAMERA_POSITION = [0, -1, 6.5] as const;
export const CAMERA_LOOK_AT_POINT = [0, 0.1, 0] as const;
/** seconds for one full circle of the cauldron; slow enough that the turn reads as drift rather than travel */
export const CAMERA_ORBIT_PERIOD_SECONDS: number = 120;

/** the orbit breathes: its distance and its height each swing on a sine of their own, so the shot never repeats on rails.
 *  the periods are prime and share no factor with the orbit's, so the three cycles take hours to line up again */
export const CAMERA_BREATH = {
  /** a fraction of the starting distance */
  reach: 0.1,
  reachPeriodSeconds: 47,
  /** in scene units, either side of the starting height */
  rise: 0.3,
  risePeriodSeconds: 73,
} as const;
