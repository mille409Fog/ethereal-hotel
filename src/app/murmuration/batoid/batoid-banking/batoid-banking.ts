/** a bat leans into a turn. the flight carries only velocity, so the turn rate is read as the change in heading
 *  since the last tick, and each bat's last heading and current roll are the only state the flock keeps beyond it */

import { IFlight } from '../../cauldron/cauldron-flight';
import { BANKING } from '../batoid-calibration';

export interface IBanking {
  /** each bat's heading about the vertical at the last tick, as poseCauldron measures it.
   *  doubles, because the turn is this difference divided by a sixtieth of a second, and a float's rounding
   *  would read as a turn of its own */
  readonly headings: Float64Array;
  /** each bat's roll about its own nose, the array poseCauldron is handed */
  readonly rolls: Float32Array;
}

/** a bat's heading about the vertical, measured exactly as poseCauldron turns it */
export function headingOf(velocities: Float32Array, i: number): number {
  return Math.atan2(velocities[i * 3], velocities[i * 3 + 2]);
}

/** the signed shortest turn from one heading to another, so a bat crossing ±π is not seen to spin the long way round */
export function turnBetween(from: number, to: number): number {
  const turn = (to - from) % (2 * Math.PI);
  if (turn > Math.PI) {
    return turn - 2 * Math.PI;
  }
  if (turn < -Math.PI) {
    return turn + 2 * Math.PI;
  }
  return turn;
}

/** the flock as it launches: every heading where it is, and every bat wings level */
export function createBanking(flight: IFlight): IBanking {
  const quantity = flight.velocities.length / 3;
  const headings = new Float64Array(quantity);
  for (let i = 0; i < quantity; i++) {
    headings[i] = headingOf(flight.velocities, i);
  }
  return { headings, rolls: new Float32Array(quantity) };
}

/** the roll a coordinated turn at this rate and speed would hold, capped at maxRoll.
 *  heading grows toward +x, which is the bat's left, so a positive turn lowers the +x wing: a negative roll */
export function rollFor(turnRate: number, speed: number): number {
  const roll = -Math.atan((speed * turnRate) / BANKING.gravity);
  return Math.min(Math.max(roll, -BANKING.maxRoll), BANKING.maxRoll);
}

/** one tick of banking: read each bat's turn since the last tick and ease its roll toward the one that turn calls for.
 *  call it after the flight is steered, so the turn it reads is the one the bat is about to fly */
export function bankFlight(flight: IFlight, banking: IBanking, seconds: number): void {
  const { velocities } = flight;
  const { headings, rolls } = banking;
  const ease = Math.min(1, seconds / BANKING.easeSeconds);
  for (let i = 0; i < headings.length; i++) {
    const heading = headingOf(velocities, i);
    const speed = Math.hypot(velocities[i * 3], velocities[i * 3 + 2]);
    const target = rollFor(turnBetween(headings[i], heading) / seconds, speed);
    rolls[i] += (target - rolls[i]) * ease;
    headings[i] = heading;
  }
}
