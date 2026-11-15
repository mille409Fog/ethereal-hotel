/**
 * every number the storm is directed by: when it rains, when the cloud breaks, where the sun goes, when the
 * plants come, and where the camera stands. the curves are in `direction.ts` and `camera-path.ts`; nothing here
 * changes the land, only when and from where it is seen.
 *
 * two clocks, and nothing else. `p` is the storm's progress, steps run over steps in all, so a slow device that
 * takes longer over the storm takes longer over everything tied to it and sees the same storm. `e` is seconds
 * since the storm's last step, on the piece's own clock, which stops when the visitor pauses.
 *
 * all of it is provisional until the phase that tunes the look, and was set to be legible and no more.
 *
 * a leaf module: it imports nothing, so Node can import it. see `model/fields.ts`.
 */

export interface IDirection {
  /** the rain rises from nothing to full over the storm's first share, holds, eases off, and stops: `p` */
  readonly rainFull: number;
  readonly rainEase: number;
  /** from here to the storm's end it does not rain at all, so the land drains to its base flow */
  readonly rainStop: number;

  /** seconds of `e` over which the cloud breaks, from overcast to clear */
  readonly clearSeconds: number;

  /** the sun the storm stands under, behind its cloud: degrees round from +x toward +z, and above the horizon */
  readonly stormSunBearing: number;
  readonly stormSunElevation: number;
  /** the sun the weather breaks to: low and warm */
  readonly goldenSunBearing: number;
  readonly goldenSunElevation: number;
  /** seconds of `e` over which the sun goes from the one to the other */
  readonly sunSeconds: number;

  /** seconds of `e` from which the plants begin to show, and by which they are whole */
  readonly greenFrom: number;
  readonly greenTo: number;

  /** degrees the high view turns round the block over the whole storm, about the vertical */
  readonly stormArc: number;
  /** seconds of `e` the camera takes to come down to the valley's mouth */
  readonly descentSeconds: number;
  /** seconds the pass up the valley takes, and the most of the valley it covers, metres */
  readonly passSeconds: number;
  readonly passLength: number;
  /** how high over the ground the pass flies, and how far ahead it looks, metres */
  readonly passClearance: number;
  readonly passLookAhead: number;
  /** what the pass looks at stands this high over the ground ahead, metres */
  readonly passTargetLift: number;
  /** the ground this far either side of the camera along the path keeps it up, metres */
  readonly passGuard: number;
  /** seconds from the end of the pass to the hero shot, where the orbit begins */
  readonly settleSeconds: number;

  /** the hero shot: how far out it stands from the block's centre, metres, and how far above the horizon */
  readonly heroDistance: number;
  readonly heroElevation: number;
  /** degrees the hero view is turned off looking straight into the sun, so the land is lit across */
  readonly heroSunOffset: number;
  /** the height above the block's centre the orbit looks at, metres */
  readonly heroTargetHeight: number;
  /** degrees a second the orbit turns once it has begun */
  readonly orbitRate: number;
  /** the visitor may tip the orbit no lower and no higher than these, degrees above the horizon */
  readonly orbitLowest: number;
  readonly orbitHighest: number;
  /** degrees a press of an arrow key turns the orbit, and degrees a pixel of drag does */
  readonly keyTurn: number;
  readonly dragTurn: number;

  /** the main valley is traced up its stem while the water draining to it is at least this share of its mouth's */
  readonly valleyStem: number;
  /** metres between the points of the traced path, and the half-width of the window that smooths it, in points */
  readonly valleySpacing: number;
  readonly valleySmoothing: number;
}

export const DIRECTION: IDirection = {
  rainFull: 0.04,
  rainEase: 0.7,
  rainStop: 0.85,

  clearSeconds: 8,

  stormSunBearing: 153,
  stormSunElevation: 28,
  goldenSunBearing: 153,
  goldenSunElevation: 10,
  sunSeconds: 14,

  greenFrom: 6,
  greenTo: 24,

  stormArc: 24,
  descentSeconds: 10,
  passSeconds: 22,
  passLength: 5200,
  passClearance: 140,
  passLookAhead: 900,
  passTargetLift: 40,
  passGuard: 400,
  settleSeconds: 12,

  heroDistance: 10500,
  heroElevation: 15,
  heroSunOffset: 50,
  heroTargetHeight: 300,
  orbitRate: 0.6,
  orbitLowest: 6,
  orbitHighest: 45,
  keyTurn: 4,
  dragTurn: 0.25,

  valleyStem: 0.02,
  valleySpacing: 80,
  valleySmoothing: 4,
};
