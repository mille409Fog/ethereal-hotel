/**
 * one step of the model: rain falls, water moves, the water takes rock and puts it down, and slopes too steep to
 * stand give way. this file is the specification. the shaders in `sim/` are held to it by a gate, and the stored
 * land is built by running it.
 *
 * the water is the virtual-pipes model of Mei, Decaudin and Hu, "Fast Hydraulic Erosion Simulation and
 * Visualization on GPU" (2007): every cell is a column of water joined to its four neighbours by pipes, and the
 * flow in a pipe accelerates with the difference in water level across it. four things here are not the paper's.
 *
 * - **bedrock and regolith are two layers.** the paper has one terrain height. here loose material lies on rock,
 *   is picked up first and much more readily, and is where deposits and rockfall go; and the rock is stored as the
 *   depth cut from it, for the reason `fields.ts` gives.
 * - **sediment travels in the pipes.** the paper moves it by tracing each cell back along the velocity and
 *   interpolating, which invents and loses sediment as it goes. here a pipe carrying a tenth of a cell's water
 *   carries a tenth of what that water holds. nothing is created, what crosses the edge is counted, and the sum of
 *   rock on the block plus rock exported is constant to the rounding of a 32-bit float.
 * - **evaporation is a depth per second**, not a share of the depth. a share drains a lake as fast as a film,
 *   and the lake is the part of the land that should still be there when the rain has gone.
 * - **the edges are open.** ground outside the block is at base level and holds no water, so an edge cell drains
 *   outward whenever its water stands above that.
 *
 * ## every pass is a gather
 *
 * a fragment shader computes one cell from what its neighbours were before the pass, and cannot write to them. so
 * no function here pushes anything into a neighbour: a cell works out what its neighbours send it by repeating
 * their arithmetic. where a pass changes what its neighbours read, it copies that into `scratch` first and reads
 * the copy. the cost is doing some sums twice; the gain is that each function below is one shader, line for line.
 *
 * ## float where the GPU is float
 *
 * the arrays are 32-bit, as the textures are, and the arithmetic between them is JavaScript's doubles. the one
 * place that difference is not negligible is a height: a level of two thousand metres resolves a quarter of a
 * millimetre in 32 bits, and water surfaces differ by less. so the three height sums are rounded to float at each
 * addition, in the order the shader adds them.
 *
 * a leaf module: see `fields.ts`.
 */
import type { IErosionConstants } from './erosion-calibration';
import type { IFields, ITerrain } from './fields';

/** the bedrock's height at cell `i`, metres */
export function bedrockAt(fields: IFields, terrain: ITerrain, i: number): number {
  return Math.fround(terrain.uplift[i] - fields.cut[i]);
}

/** the ground's height at cell `i`: bedrock and what lies on it, metres */
export function surfaceAt(fields: IFields, terrain: ITerrain, i: number): number {
  return Math.fround(bedrockAt(fields, terrain, i) + fields.regolith[i]);
}

/** the water's level at cell `i`, which is the ground's height where there is none, metres */
export function levelAt(fields: IFields, terrain: ITerrain, i: number): number {
  return Math.fround(surfaceAt(fields, terrain, i) + fields.water[i]);
}

/**
 * which entry of a strata table of `entries` a bedrock height falls in. the shader does the same arithmetic in
 * the same order, so the two agree on the bed at a boundary.
 */
export function strataIndex(
  bedrock: number,
  warp: number,
  constants: IErosionConstants,
  entries: number
): number {
  const share = (bedrock + warp - constants.strataFloor) / constants.strataSpan;
  return Math.min(entries - 1, Math.max(0, Math.floor(share * entries)));
}

/** how readily the bedrock now exposed at cell `i` erodes, in (0, 1] */
export function erodibilityAt(
  fields: IFields,
  terrain: ITerrain,
  constants: IErosionConstants,
  i: number
): number {
  const { erodibility } = terrain;
  const bed = strataIndex(
    bedrockAt(fields, terrain, i),
    terrain.warp[i],
    constants,
    erodibility.length
  );
  return erodibility[bed];
}

/**
 * the share of cell `i`'s water that leaves through a pipe carrying `flux` this step. `outflow` is the sum of
 * the cell's four fluxes. the flux pass has already scaled them so a cell cannot give more than it holds; dividing
 * by whichever is larger keeps the shares summing to at most one when rounding has let them through a hair over.
 */
function shareLeaving(
  water: number,
  flux: number,
  outflow: number,
  timestep: number,
  area: number
): number {
  if (water <= 0 || outflow <= 0) {
    return 0;
  }
  return (flux * timestep) / Math.max(water * area, outflow * timestep);
}

/**
 * `values[j]` when that neighbour is on the block, and `beyond` when it is off the edge. every pass meets the
 * edge four times a cell, and what stands in for a missing neighbour is the whole of its boundary condition, so
 * it is named at each call instead of being folded into an index.
 */
function across(values: Float32Array, j: number, onBlock: boolean, beyond: number): number {
  return onBlock ? values[j] : beyond;
}

/** rain: `strength` in [0, 1] of the calibrated rate, everywhere at once */
export function rainFall(fields: IFields, constants: IErosionConstants, strength: number): void {
  const { water, ledger, size } = fields;
  const area = (constants.extent / size) ** 2;
  const depth = constants.timestep * constants.rainRate * strength;
  let fallen = 0;
  for (let i = 0; i < water.length; i++) {
    const before = water[i];
    water[i] = before + depth;
    // the ledger counts what the array took, which is the depth rounded to float
    fallen += water[i] - before;
  }
  ledger.rained += fallen * area;
}

/**
 * the pipes: each of a cell's four outflows gains in proportion to how far its water level stands above the
 * neighbour's, and loses when it stands below, never going negative. then the four are scaled down together if
 * they would otherwise carry off more water than the cell has.
 */
export function pipeFlux(fields: IFields, terrain: ITerrain, constants: IErosionConstants): void {
  const { size, water, fluxLeft, fluxRight, fluxUp, fluxDown, scratch } = fields;
  const cell = constants.extent / size;
  const area = cell * cell;
  // gravity times the pipe's area over its length; the pipe is one cell wide and one cell long
  const pull = constants.timestep * constants.gravity * constants.pipeDepth;
  const outside = constants.baseLevel;
  for (let i = 0; i < scratch.length; i++) {
    scratch[i] = levelAt(fields, terrain, i);
  }
  const last = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const level = scratch[i];
      // ground beyond the edge is at base level and dry
      const levelLeft = across(scratch, i - 1, x > 0, outside);
      const levelRight = across(scratch, i + 1, x < last, outside);
      const levelUp = across(scratch, i - size, y > 0, outside);
      const levelDown = across(scratch, i + size, y < last, outside);
      let left = Math.max(0, fluxLeft[i] + pull * (level - levelLeft));
      let right = Math.max(0, fluxRight[i] + pull * (level - levelRight));
      let up = Math.max(0, fluxUp[i] + pull * (level - levelUp));
      let down = Math.max(0, fluxDown[i] + pull * (level - levelDown));
      // summed in pairs so the result is the same whichever way the land is mirrored or turned
      const outflow = left + right + (up + down);
      if (outflow > 0) {
        const held = Math.min(1, (water[i] * area) / (outflow * constants.timestep));
        left *= held;
        right *= held;
        up *= held;
        down *= held;
      }
      fluxLeft[i] = left;
      fluxRight[i] = right;
      fluxUp[i] = up;
      fluxDown[i] = down;
    }
  }
}

/**
 * sediment rides the pipes: whatever share of a cell's water leaves through a pipe, that share of its suspended
 * sediment leaves with it. must run after `pipeFlux` and before `flow`, while the water is still the depth the
 * fluxes were scaled against.
 */
export function carry(fields: IFields, constants: IErosionConstants): void {
  const { size, water, suspended, fluxLeft, fluxRight, fluxUp, fluxDown, scratch, ledger } = fields;
  const dt = constants.timestep;
  const area = (constants.extent / size) ** 2;
  scratch.set(suspended);
  const outflowOf = (j: number): number => fluxLeft[j] + fluxRight[j] + (fluxUp[j] + fluxDown[j]);
  const last = size - 1;
  let exported = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const outflow = outflowOf(i);
      const held = scratch[i];
      const leaving = shareLeaving(water[i], outflow, outflow, dt, area);
      let arriving = 0;
      if (x > 0) {
        const j = i - 1;
        arriving += scratch[j] * shareLeaving(water[j], fluxRight[j], outflowOf(j), dt, area);
      } else {
        exported += held * shareLeaving(water[i], fluxLeft[i], outflow, dt, area);
      }
      if (x < last) {
        const j = i + 1;
        arriving += scratch[j] * shareLeaving(water[j], fluxLeft[j], outflowOf(j), dt, area);
      } else {
        exported += held * shareLeaving(water[i], fluxRight[i], outflow, dt, area);
      }
      if (y > 0) {
        const j = i - size;
        arriving += scratch[j] * shareLeaving(water[j], fluxDown[j], outflowOf(j), dt, area);
      } else {
        exported += held * shareLeaving(water[i], fluxUp[i], outflow, dt, area);
      }
      if (y < last) {
        const j = i + size;
        arriving += scratch[j] * shareLeaving(water[j], fluxUp[j], outflowOf(j), dt, area);
      } else {
        exported += held * shareLeaving(water[i], fluxDown[i], outflow, dt, area);
      }
      suspended[i] = held * (1 - leaving) + arriving;
    }
  }
  ledger.exported += exported * area;
}

/**
 * the water itself moves: each cell's depth changes by what its neighbours send less what it sends, and its
 * velocity is the net flow through it over the depth it flowed at.
 */
export function flow(fields: IFields, constants: IErosionConstants): void {
  const { size, water, fluxLeft, fluxRight, fluxUp, fluxDown, velocityX, velocityY, ledger } =
    fields;
  const dt = constants.timestep;
  const cell = constants.extent / size;
  const area = cell * cell;
  const last = size - 1;
  let drained = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // nothing flows in from beyond the edge
      const fromLeft = across(fluxRight, i - 1, x > 0, 0);
      const fromRight = across(fluxLeft, i + 1, x < last, 0);
      const fromUp = across(fluxDown, i - size, y > 0, 0);
      const fromDown = across(fluxUp, i + size, y < last, 0);
      const inflow = fromLeft + fromRight + (fromUp + fromDown);
      const outflow = fluxLeft[i] + fluxRight[i] + (fluxUp[i] + fluxDown[i]);
      const before = water[i];
      // the flux pass keeps this from going negative; the clamp is for the last bit of a float
      water[i] = Math.max(0, before + (dt * (inflow - outflow)) / area);

      // the mean of the flow through the cell's two faces, over the face the water crossed; a film has none
      const depth = (before + water[i]) / 2;
      const perFlow = depth > constants.depthFloor ? 1 / (2 * cell * depth) : 0;
      const speedX = (fromLeft - fluxLeft[i] + (fluxRight[i] - fromRight)) * perFlow;
      const speedY = (fromUp - fluxUp[i] + (fluxDown[i] - fromDown)) * perFlow;
      const speed = Math.hypot(speedX, speedY);
      const rein = speed > constants.maxSpeed ? constants.maxSpeed / speed : 1;
      velocityX[i] = speedX * rein;
      velocityY[i] = speedY * rein;

      // an edge cell's outward pipe empties off the block
      drained +=
        across(fluxLeft, i, x === 0, 0) +
        across(fluxRight, i, x === last, 0) +
        (across(fluxUp, i, y === 0, 0) + across(fluxDown, i, y === last, 0));
    }
  }
  ledger.drained += drained * dt;
}

/**
 * the exchange between water and ground. a flow can hold sediment in proportion to its speed and its tilt; with
 * room to spare it takes more, loose material first and then rock at the rate its bed allows, and holding too
 * much it lays the excess down as loose material. nothing here moves between cells, so the ground's snapshot is
 * read only for its slope.
 */
export function erode(fields: IFields, terrain: ITerrain, constants: IErosionConstants): void {
  const { size, cut, regolith, water, suspended, velocityX, velocityY, scratch } = fields;
  const dt = constants.timestep;
  const cell = constants.extent / size;
  for (let i = 0; i < scratch.length; i++) {
    scratch[i] = surfaceAt(fields, terrain, i);
  }
  const last = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // off the edge the ground is taken to be level with the edge cell, so the block's rim adds no tilt
      const slopeX = (scratch[x < last ? i + 1 : i] - scratch[x > 0 ? i - 1 : i]) / (2 * cell);
      const slopeY =
        (scratch[y < last ? i + size : i] - scratch[y > 0 ? i - size : i]) / (2 * cell);
      const steepness = slopeX * slopeX + slopeY * slopeY;
      const tilt = Math.max(constants.minTilt, Math.sqrt(steepness / (1 + steepness)));
      const speed = Math.hypot(velocityX[i], velocityY[i]);
      const shallows = Math.min(1, water[i] / constants.rampDepth);
      const room = constants.capacity * tilt * speed * shallows - suspended[i];

      if (room > 0) {
        const wanted = dt * constants.dissolveRate * room;
        const loose = Math.min(regolith[i], wanted * constants.regolithFactor);
        const rock =
          (wanted - loose / constants.regolithFactor) *
          erodibilityAt(fields, terrain, constants, i);
        regolith[i] -= loose;
        cut[i] += rock;
        suspended[i] += loose + rock;
      } else {
        const settling = dt * constants.depositRate * -room;
        suspended[i] -= settling;
        regolith[i] += settling;
      }
    }
  }
}

/**
 * the air takes a fixed depth of water from every cell that has it. a cell left dry lays down whatever its water
 * still held, since there is no longer anything holding it.
 */
export function evaporate(fields: IFields, constants: IErosionConstants): void {
  const { size, water, suspended, regolith, ledger } = fields;
  const area = (constants.extent / size) ** 2;
  const depth = constants.timestep * constants.evaporationRate;
  let taken = 0;
  for (let i = 0; i < water.length; i++) {
    const before = water[i];
    water[i] = Math.max(0, before - depth);
    taken += before - water[i];
    if (water[i] < constants.dryDepth) {
      regolith[i] += suspended[i];
      suspended[i] = 0;
    }
  }
  ledger.evaporated += taken * area;
}

/**
 * slopes give way. loose material slides wherever the ground falls to a neighbour more steeply than it can rest,
 * as far as there is loose material to slide. bedrock holds a steeper face, steeper the harder its bed, and past
 * that it breaks, and what breaks off arrives next door as loose material. nothing slides off the edge of the
 * block; only water carries rock away.
 *
 * two sweeps, because a cell's loss is its neighbours' gain and a gather cannot push: `slumpShed` works out what
 * each cell sheds toward each neighbour, and `slumpSettle` takes that from the cell and collects what the
 * neighbours shed toward it. they are two shaders on the GPU for the same reason.
 */
export function slump(fields: IFields, terrain: ITerrain, constants: IErosionConstants): void {
  slumpShed(fields, terrain, constants);
  slumpSettle(fields);
}

/** how much of a drop to a neighbour is more than a slope of `rest` allows, metres */
function excess(drop: number, rest: number): number {
  return Math.max(0, drop - rest);
}

/** the first sweep: what each cell sheds toward each of its neighbours this step */
export function slumpShed(fields: IFields, terrain: ITerrain, constants: IErosionConstants): void {
  const { size, regolith, slumpLeft, slumpRight, slumpUp, slumpDown, scratch } = fields;
  const cell = constants.extent / size;
  const share = constants.slumpShare;
  const restLoose = constants.talusRegolith * cell;
  for (let i = 0; i < scratch.length; i++) {
    scratch[i] = surfaceAt(fields, terrain, i);
  }
  const last = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const height = scratch[i];
      // ground beyond the edge is taken to be level with the cell, so there is no drop to slide down
      const dropLeft = height - across(scratch, i - 1, x > 0, height);
      const dropRight = height - across(scratch, i + 1, x < last, height);
      const dropUp = height - across(scratch, i - size, y > 0, height);
      const dropDown = height - across(scratch, i + size, y < last, height);

      const looseLeft = excess(dropLeft, restLoose);
      const looseRight = excess(dropRight, restLoose);
      const looseUp = excess(dropUp, restLoose);
      const looseDown = excess(dropDown, restLoose);
      const sliding = share * (looseLeft + looseRight + (looseUp + looseDown));

      let scale = 0;
      if (sliding > 0) {
        const soft = erodibilityAt(fields, terrain, constants, i);
        const restRock =
          (constants.talusRockHard + (constants.talusRockSoft - constants.talusRockHard) * soft) *
          cell;
        const breaking =
          share *
          (excess(dropLeft, restRock) +
            excess(dropRight, restRock) +
            (excess(dropUp, restRock) + excess(dropDown, restRock)));
        // loose material slides as far as there is any; rock past its own limit goes regardless
        scale = Math.max(Math.min(sliding, regolith[i]), breaking) / sliding;
      }
      slumpLeft[i] = scale * share * looseLeft;
      slumpRight[i] = scale * share * looseRight;
      slumpUp[i] = scale * share * looseUp;
      slumpDown[i] = scale * share * looseDown;
    }
  }
}

/** the second sweep: each cell gives up what it shed, loose material first, and takes in what was shed toward it */
export function slumpSettle(fields: IFields): void {
  const { size, cut, regolith, slumpLeft, slumpRight, slumpUp, slumpDown } = fields;
  const last = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const shed = slumpLeft[i] + slumpRight[i] + (slumpUp[i] + slumpDown[i]);
      const loose = Math.min(regolith[i], shed);
      const received =
        across(slumpRight, i - 1, x > 0, 0) +
        across(slumpLeft, i + 1, x < last, 0) +
        (across(slumpDown, i - size, y > 0, 0) + across(slumpUp, i + size, y < last, 0));
      cut[i] += shed - loose;
      regolith[i] = regolith[i] - loose + received;
    }
  }
}

/** one whole step, with rain at `strength` in [0, 1] */
export function step(
  fields: IFields,
  terrain: ITerrain,
  constants: IErosionConstants,
  strength: number
): void {
  rainFall(fields, constants, strength);
  pipeFlux(fields, terrain, constants);
  carry(fields, constants);
  flow(fields, constants);
  erode(fields, terrain, constants);
  evaporate(fields, constants);
  slump(fields, terrain, constants);
}
