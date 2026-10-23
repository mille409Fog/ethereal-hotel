import { IFlight, IThreeTuple } from '../../cauldron/cauldron-flight';
import { BANKING, FLIGHT_SPEED } from '../batoid-calibration';
import { bankFlight, createBanking, headingOf, rollFor, turnBetween } from './batoid-banking';

const TICK = 1 / 60;

/** a flight with the given velocities, every bat at the origin; banking never reads position */
function flying(...velocities: IThreeTuple[]): IFlight {
  return {
    positions: new Float32Array(velocities.length * 3),
    velocities: new Float32Array(velocities.flatMap(({ x, y, z }) => [x, y, z])),
  };
}

/** turns bat i about the vertical by the given angle, keeping its speed and climb */
function turn(flight: IFlight, i: number, angle: number): void {
  const v = flight.velocities;
  const heading = headingOf(v, i) + angle;
  const horizontal = Math.hypot(v[i * 3], v[i * 3 + 2]);
  v[i * 3] = Math.sin(heading) * horizontal;
  v[i * 3 + 2] = Math.cos(heading) * horizontal;
}

describe('turnBetween', () => {
  it('is the plain difference for a small turn', () => {
    expect(turnBetween(0.25, 0.5)).toBeCloseTo(0.25);
    expect(turnBetween(0.5, 0.25)).toBeCloseTo(-0.25);
  });

  it('goes the short way across ±π', () => {
    expect(turnBetween(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(turnBetween(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2);
  });

  it('never exceeds π in size', () => {
    const draws = [-3, -2, -0.5, 0, 1, 2.5, 3.1];
    for (const a of draws) {
      for (const b of draws) {
        expect(Math.abs(turnBetween(a, b))).toBeLessThanOrEqual(Math.PI + 1e-12);
      }
    }
  });
});

describe('rollFor', () => {
  it('holds a bat flying straight wings level', () => {
    expect(rollFor(0, FLIGHT_SPEED)).toBeCloseTo(0);
  });

  it('banks as a coordinated turn does, tan(roll) = speed × rate / gravity', () => {
    const rate = 0.5;

    expect(Math.tan(-rollFor(rate, FLIGHT_SPEED))).toBeCloseTo(
      (FLIGHT_SPEED * rate) / BANKING.gravity
    );
  });

  it('lowers the inside wing: a turn toward +x is a negative roll, and toward -x a positive one', () => {
    expect(rollFor(0.5, FLIGHT_SPEED)).toBeLessThan(0);
    expect(rollFor(-0.5, FLIGHT_SPEED)).toBeGreaterThan(0);
  });

  it('never banks past maxRoll however hard the turn', () => {
    expect(rollFor(1000, FLIGHT_SPEED)).toBeCloseTo(-BANKING.maxRoll);
    expect(rollFor(-1000, FLIGHT_SPEED)).toBeCloseTo(BANKING.maxRoll);
  });
});

describe('createBanking', () => {
  it('starts every bat wings level, remembering the heading it launched on', () => {
    const flight = flying({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });

    const banking = createBanking(flight);

    expect(Array.from(banking.rolls)).toEqual([0, 0]);
    expect(banking.headings[0]).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(banking.headings[1])).toBeCloseTo(Math.PI);
  });
});

describe('bankFlight', () => {
  it('leaves a bat flying straight wings level', () => {
    const flight = flying({ x: 0, y: 0, z: FLIGHT_SPEED });
    const banking = createBanking(flight);

    for (let tick = 0; tick < 60; tick++) {
      bankFlight(flight, banking, TICK);
    }

    expect(banking.rolls[0]).toBe(0);
  });

  it('eases toward the roll a steady turn calls for, rather than snapping to it', () => {
    const flight = flying({ x: 0, y: 0, z: FLIGHT_SPEED });
    const banking = createBanking(flight);
    const rate = 0.5;
    const target = rollFor(rate, FLIGHT_SPEED);

    turn(flight, 0, rate * TICK);
    bankFlight(flight, banking, TICK);
    const first = banking.rolls[0];
    for (let tick = 0; tick < 120; tick++) {
      turn(flight, 0, rate * TICK);
      bankFlight(flight, banking, TICK);
    }

    expect(first).toBeLessThan(0);
    expect(first).toBeGreaterThan(target);
    expect(banking.rolls[0]).toBeCloseTo(target, 3);
  });

  it('comes back to level once the turn ends', () => {
    const flight = flying({ x: 0, y: 0, z: FLIGHT_SPEED });
    const banking = createBanking(flight);
    for (let tick = 0; tick < 60; tick++) {
      turn(flight, 0, 0.5 * TICK);
      bankFlight(flight, banking, TICK);
    }

    for (let tick = 0; tick < 240; tick++) {
      bankFlight(flight, banking, TICK);
    }

    expect(banking.rolls[0]).toBeCloseTo(0, 3);
  });

  it('reads a turn across ±π as the small turn it is, not a spin the other way', () => {
    // heading just short of +π, turning a little further: a naive difference would read nearly -2π
    const seam = flying({ x: Math.sin(Math.PI - 0.001), y: 0, z: Math.cos(Math.PI - 0.001) });
    const open = flying({ x: 0, y: 0, z: 1 });
    const atSeam = createBanking(seam);
    const inOpen = createBanking(open);

    turn(seam, 0, 0.5 * TICK);
    turn(open, 0, 0.5 * TICK);
    bankFlight(seam, atSeam, TICK);
    bankFlight(open, inOpen, TICK);

    expect(atSeam.rolls[0]).toBeLessThan(0);
    expect(atSeam.rolls[0]).toBeCloseTo(inOpen.rolls[0], 4);
  });

  it('banks each bat by its own turn', () => {
    const flight = flying({ x: 0, y: 0, z: FLIGHT_SPEED }, { x: 0, y: 0, z: FLIGHT_SPEED });
    const banking = createBanking(flight);

    turn(flight, 0, 0.5 * TICK);
    turn(flight, 1, -0.5 * TICK);
    bankFlight(flight, banking, TICK);

    expect(banking.rolls[0]).toBeLessThan(0);
    expect(banking.rolls[1]).toBeGreaterThan(0);
    expect(banking.rolls[0]).toBeCloseTo(-banking.rolls[1], 6);
  });
});
