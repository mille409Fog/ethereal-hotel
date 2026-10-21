import { IFlight, IPositionAndVelocity, IThreeTuple } from '../cauldron/cauldron-flight';
import { FLIGHT_SPEED } from './batoid-calibration';
import { Random } from './batoid-types';

/** given some mapping function that produces a random number derived from an injection token we produce a random response from an equally distributed region of a given radius length about 0*/
export function spread(random: Random, radius: number): number {
  return (random() * 2 - 1) * radius;
}
/** takes an injected random token and returns an initial flight state for one entity, a collection of positions and velocities */
export function launchSingleFlightState(random: Random, radii: IThreeTuple): IPositionAndVelocity {
  const x = spread(random, radii.x);
  const y = spread(random, radii.y);
  const z = spread(random, radii.z);
  const heading = spread(random, Math.PI);

  const xv = Math.cos(heading) * FLIGHT_SPEED;
  const zv = Math.sin(heading) * FLIGHT_SPEED;
  return { position: { x, y, z }, velocity: { x: xv, y: 0, z: zv } };
}
/** generates the initial flight state for the cauldron from a random token and collection of radii
 *  we use quantity as an input to aid unit simulation **/
export function launchInitialState(random: Random, radii: IThreeTuple, quantity: number): IFlight {
  const positions = new Float32Array(quantity * 3);
  const velocities = new Float32Array(quantity * 3);

  for (let i = 0; i < quantity; i++) {
    const o = i * 3;
    const positionAndVelocity = launchSingleFlightState(random, radii);
    writeThreeTuple(positions, o, positionAndVelocity.position);
    writeThreeTuple(velocities, o, positionAndVelocity.velocity);
  }
  return { positions, velocities };
}
/** writes an existing three tuple to a float 32 array */
export function writeThreeTuple(array: Float32Array, offset: number, tuple: IThreeTuple): void {
  array[offset] = tuple.x;
  array[offset + 1] = tuple.y;
  array[offset + 2] = tuple.z;
}
