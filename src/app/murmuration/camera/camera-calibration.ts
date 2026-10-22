/** constants used to calibrate where the camera is placed and how it operates */

export const CAMERA_VERTICAL_FOV: number = 50;
export const CAMERA_NEAR: number = 0.1;
export const CAMERA_FAR: number = 100;
export const CAMERA_POSITION = [0, -0.3, 3] as const; // note that we are using a camera loop, so this describes the initial point rather than a constant point
export const CAMERA_LOOK_AT_POINT = [0, 0.5, 0] as const;
/** seconds for one full circle of the cauldron; slow enough that the turn reads as drift rather than travel */
export const CAMERA_ORBIT_PERIOD_SECONDS: number = 120;
