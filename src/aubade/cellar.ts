/**
 * Floor −3's two clocks: the breath you are asked to keep, and the stillness the
 * room is paid for in.
 *
 * Every other floor of this hotel is a function of the sun and of nothing else.
 * Stand in the lobby for an hour and it is the same lobby; the only thing that
 * ever changed it was astronomy. The Cellar is the one room where the visitor is
 * an input, and this file is the whole of that — two numbers, both pure functions
 * of time, neither of which knows anything about WebGL.
 *
 * ## The breath is 4-7-8 and it is not decoration
 *
 * AUBADE's phase note asks for "breath pacing, 4-7-8 cycle". That is a real
 * technique — in four seconds, hold seven, out eight — and the reason it is the
 * one specified is that it is slower than a person breathes unprompted. Nineteen
 * seconds is a long time. A visitor who follows the camera down and back up finds
 * they have been made to slow down before they have decided to, which is the
 * shortest route to the thing this floor is for.
 *
 * So the camera's gait changes on this floor. `camera/drift.ts` runs three
 * incommensurable sines everywhere else, chosen precisely so the piece never
 * visibly loops — and here it crossfades into a curve that loops on purpose,
 * every nineteen seconds, because a pace you cannot find is not a pace you can
 * keep. That is the one place in the piece where a visible period is correct, and
 * it is worth saying out loud because it reads as a regression against that file's
 * stated rule.
 *
 * ## The stillness is measured, not waited out
 *
 * "The room resolves only if you stay" was the phase's phrase and it admits two
 * readings. One is a timer that runs from the moment the lift doors open. The
 * other is that staying means *being still* — no pointer, no key, no scroll — and
 * that moving costs you.
 *
 * The second one is the room. A timer is something a visitor waits out with their
 * hand on the mouse, and it would make the floor a loading screen with a view. So
 * disturbance drains the accumulated stillness, and it drains it about seven times
 * faster than quiet fills it: a twitch is expensive and a fidget is fatal, which
 * is the arithmetic of the thing the floor is asking for.
 *
 * It drains rather than resets, and that is the one concession. A reset would mean
 * that eighty-nine seconds of stillness and one mouse jog puts a visitor back at
 * the beginning, and nobody comes back from that a second time. Draining costs
 * them twelve seconds' worth of ground for every second of movement and lets them
 * see it going.
 *
 * ## Both are in simulated seconds
 *
 * The room's clock, from `gl/loop.ts`, rather than `performance.now()`. A
 * backgrounded tab stops advancing it, which is exactly right here: a visitor
 * reading their email in another tab is not standing in a cellar being quiet, and
 * a floor that resolved itself while nobody was looking at it would have given
 * away the only thing it has.
 */

/** Seconds of the inhale. */
export const BREATH_IN_SECONDS = 4;

/** Seconds the breath is held at the top. The long one, and the point of the pattern. */
export const BREATH_HOLD_SECONDS = 7;

/** Seconds of the exhale. Longer than the inhale, which is what makes it calming. */
export const BREATH_OUT_SECONDS = 8;

/** One whole cycle. Nineteen seconds; about three of them a minute. */
export const BREATH_CYCLE_SECONDS = BREATH_IN_SECONDS + BREATH_HOLD_SECONDS + BREATH_OUT_SECONDS;

/**
 * Seconds of unbroken stillness that take the room all the way in.
 *
 * AUBADE says "the room resolving over ~90 seconds of stillness" and this is that
 * number, unrounded to anything friendlier. It is also, not by accident, four and
 * three-quarter breaths — near enough five that a visitor who has settled into the
 * pattern arrives at the end of the cycle they are already in.
 *
 * Ninety seconds is a very long time to ask for and the phase note says so: "the
 * hardest thing here is nerve". Anything that felt reasonable would be a room that
 * rewards waiting rather than one that rewards patience, and those are not the
 * same and only one of them is worth building.
 */
export const SETTLE_SECONDS = 90;

/**
 * Seconds of continuous movement that undo all of it.
 *
 * Seven and a half times faster than stillness accrues. That ratio is the floor's
 * whole demand expressed as a number, and it was chosen from the other end: a
 * single flick of a pointer occupies perhaps a fifth of a second, which costs
 * about a sixtieth of the room. Noticeable, recoverable, and unmistakably a cost.
 */
export const UNSETTLE_SECONDS = 12;

/**
 * How full the lungs are, on the 4-7-8 pattern.
 *
 * Piecewise and deliberately not smooth at the joins. A sine would be easier and
 * would be a different exercise: what makes 4-7-8 do anything is that the hold is
 * a *hold* — flat, and long enough to be uncomfortable — and a curve that eases
 * through the top of it has quietly replaced the pattern with a sigh. The corners
 * are the technique.
 *
 * The two moving legs are eased with the same raised cosine `descent.ts` uses, so
 * the turn at each end is a turn rather than a bounce.
 *
 * @param seconds The room's clock. Non-finite input reads as empty, for the reason
 *   every other guard in this piece exists: a `NaN` here becomes a `NaN` uniform
 *   and a `NaN` uniform is a black screen with nothing in the console.
 * @returns 0 at empty, 1 at full. **Exactly 0 at second zero**, which is not a
 *   detail — `camera/drift.ts` blends this against its own sines to place the
 *   camera, and the reduced-motion still is that function at zero. A breath curve
 *   that started anywhere but empty would move the held composition off its own
 *   anchor by a few millimetres on one floor and no other, which is the sort of
 *   thing that gets found six months later and blamed on the anchor.
 */
export function breathAt(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return 0;
  }

  // Positive modulo: the camera is evaluated at `simulatedSeconds + alpha × step`
  // and nothing forbids a caller from asking about a negative second.
  const cycle = ((seconds % BREATH_CYCLE_SECONDS) + BREATH_CYCLE_SECONDS) % BREATH_CYCLE_SECONDS;

  if (cycle < BREATH_IN_SECONDS) {
    return rise(cycle / BREATH_IN_SECONDS);
  }
  if (cycle < BREATH_IN_SECONDS + BREATH_HOLD_SECONDS) {
    return 1;
  }
  const out = (cycle - BREATH_IN_SECONDS - BREATH_HOLD_SECONDS) / BREATH_OUT_SECONDS;
  return 1 - rise(out);
}

/**
 * A raised cosine: 0 at 0, 1 at 1, flat at both ends.
 *
 * The same curve as `easeInOutSine` in `descent.ts`, and deliberately a second
 * copy rather than an import. That one is the lift's and its file comment is three
 * paragraphs about why its endpoints have to be exact for the shader's scene
 * branch; this one is a pair of lungs. Sharing them would tie a change in how a
 * lift decelerates to how a breath turns over, and the next person to tune either
 * would have to discover the other.
 *
 * @param fraction Progress along one leg of the breath, already in [0, 1].
 * @returns The eased fraction. Exactly 0 and 1 at the ends — see `breathAt`.
 */
function rise(fraction: number): number {
  return (1 - Math.cos(Math.PI * fraction)) / 2;
}

/**
 * Where the stillness stands after one frame.
 *
 * Integrated per frame rather than derived from a timestamp, because the quantity
 * has memory: it is not "how long since the last disturbance" but "how much ground
 * has been gained net of how much has been given back", and those differ the
 * moment anybody moves twice.
 *
 * @param settled Where it stood at the end of the previous frame, in [0, 1].
 *   Values outside that range are clamped rather than trusted; the caller holds
 *   this across frames and a single bad frame would otherwise be permanent.
 * @param deltaSeconds Simulated seconds since the previous frame. Non-finite or
 *   negative input advances nothing, which is what a restarted loop's first frame
 *   hands over.
 * @param disturbed Whether the visitor moved during this frame.
 * @returns The new stillness, in [0, 1]. Rises towards 1 over `SETTLE_SECONDS` of
 *   quiet and falls to 0 over `UNSETTLE_SECONDS` of movement.
 */
export function settleStep(settled: number, deltaSeconds: number, disturbed: boolean): number {
  const from = Number.isFinite(settled) ? Math.min(Math.max(settled, 0), 1) : 0;

  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return from;
  }

  const rate = disturbed ? -1 / UNSETTLE_SECONDS : 1 / SETTLE_SECONDS;
  return Math.min(Math.max(from + rate * deltaSeconds, 0), 1);
}
