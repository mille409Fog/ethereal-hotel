/** the flock's simulation, advanced in whole ticks; nothing here knows about the renderer, the camera or the frame */
import { bankFlight, IBanking } from '../../batoid/batoid-banking/batoid-banking';
import { ISteeringScratch, steerFlight } from '../../batoid/batoid-behavior/batoid-behavior';
import * as CALIBRATION from '../../batoid/batoid-calibration';
import { flightStep } from '../../batoid/batoid-transformation/batoid-transformation';
import { IFlight } from '../cauldron-flight';

/** flies the flock forward by the given number of ticks, each one TICK_SECONDS long */
export function flyTicks(
  flight: IFlight,
  banking: IBanking,
  scratch: ISteeringScratch,
  ticks: number
): void {
  for (let i = 0; i < ticks; i++) {
    // turn first, lean into the turn, then fly the new heading, so each tick's position follows from that tick's steer
    steerFlight(
      flight,
      CALIBRATION.TICK_SECONDS,
      CALIBRATION.AWARENESS,
      CALIBRATION.BEHAVIOUR_WEIGHTS,
      CALIBRATION.INITIAL_DIMENSIONS,
      scratch
    );
    bankFlight(flight, banking, CALIBRATION.TICK_SECONDS);
    flightStep(flight, CALIBRATION.TICK_SECONDS);
  }
}
