export interface IFlight {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
}

// used to hold an individual position in 3-space, can be repurposed for the velocity components
export interface IThreeTuple {
  x: number;
  y: number;
  z: number;
}

export interface IPositionAndVelocity {
  position: IThreeTuple;
  velocity: IThreeTuple;
}
