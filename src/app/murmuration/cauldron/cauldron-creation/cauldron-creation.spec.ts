import * as THREE from 'three';
import * as CALIBRATION from '../../batoid/batoid-calibration';
import { writeThreeTuple } from '../../batoid/batoid-transformation';
import { IFlight, IThreeTuple } from '../cauldron-flight';
import { beatWings, createCauldron, poseCauldron, wingBeatChunk } from './cauldron-creation';

type Triple = readonly [number, number, number];

interface IPose {
  readonly position: Triple;
  /** Where the bat's local +z — the way its head points — goes once posed. */
  readonly facing: Triple;
  /** How long the bat's local +z has become: its scale, for a uniform one. */
  readonly scale: number;
}

/**
 * Bat `index`'s pose, read straight out of the instance buffer. Each bat is a
 * column-major 4×4 matrix: elements 12–14 are its translation, and column 2
 * (elements 8–10) is where local +z went under rotation and scale together.
 */
const poseOf = (flock: THREE.InstancedMesh, index: number): IPose => {
  const m = flock.instanceMatrix.array.slice(index * 16, index * 16 + 16);
  const scale = Math.hypot(m[8], m[9], m[10]);
  return {
    position: [m[12], m[13], m[14]],
    facing: [m[8] / scale, m[9] / scale, m[10] / scale],
    scale,
  };
};

/** The direction a velocity points, which is where a posed bat should face. */
const along = (velocity: IThreeTuple): Triple => {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  return [velocity.x / speed, velocity.y / speed, velocity.z / speed];
};

/**
 * The instance buffer is a `Float32Array`, so a pose comes back with about
 * seven significant digits; five decimal places is comfortably inside that.
 */
const DIGITS = 5;

const expectNear = (actual: Triple, expected: Triple): void => {
  expect(actual[0]).toBeCloseTo(expected[0], DIGITS);
  expect(actual[1]).toBeCloseTo(expected[1], DIGITS);
  expect(actual[2]).toBeCloseTo(expected[2], DIGITS);
};

interface IBat {
  readonly position: IThreeTuple;
  readonly velocity: IThreeTuple;
}

/**
 * A full cauldron's flight with the given bats at the front and every other
 * bat at rest at the origin. `poseCauldron` poses one bat per instance, so the
 * arrays must be as long as the mesh even when a test only cares about two.
 */
const flightOf = (...bats: readonly IBat[]): IFlight => {
  const positions = new Float32Array(CALIBRATION.CAULDRON.count * 3);
  const velocities = new Float32Array(CALIBRATION.CAULDRON.count * 3);
  bats.forEach((bat, i) => {
    writeThreeTuple(positions, i * 3, bat.position);
    writeThreeTuple(velocities, i * 3, bat.velocity);
  });
  return { positions, velocities };
};

/**
 * Climbing and diving, along both horizontal axes and between them. A bat
 * heading along x is the one a wrong rotation order gives away: pitching it
 * about the world's x axis rolls it instead of tipping its nose.
 */
const PITCHED: readonly IThreeTuple[] = [
  { x: 1, y: 0.2, z: 0 },
  { x: -1, y: -0.2, z: 0 },
  { x: 0, y: 0.2, z: 1 },
  { x: 0, y: -0.2, z: -1 },
  { x: 0.3, y: 0.1, z: 0.4 },
  { x: -0.3, y: -0.1, z: 0.4 },
  { x: -0.3, y: 0.1, z: -0.4 },
  { x: 0.3, y: -0.1, z: -0.4 },
];

/** One heading per quadrant and both axes, so a swapped atan2 argument shows in at least one. */
const HEADINGS: readonly IThreeTuple[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: -1 },
  { x: 0.3, y: 0, z: 0.4 },
  { x: -0.3, y: 0, z: 0.4 },
  { x: -0.3, y: 0, z: -0.4 },
  { x: 0.3, y: 0, z: -0.4 },
];

type Flock = ReturnType<typeof createCauldron>;

describe('cauldron', () => {
  const made: Flock[] = [];

  /** Every cauldron a test makes is released after it, as the component would. */
  const cauldron = (): Flock => {
    const flock = createCauldron();
    made.push(flock);
    return flock;
  };

  afterEach(() => {
    for (const flock of made.splice(0)) {
      flock.geometry.dispose();
      flock.material.dispose();
      flock.dispose();
    }
  });

  describe('createCauldron', () => {
    it('holds one instance per bat in the cauldron', () => {
      expect(cauldron().count).toBe(CALIBRATION.CAULDRON.count);
    });

    it('dresses the flock in the palette, flat-shaded', () => {
      const material = cauldron().material;

      expect(material.color.getHex()).toBe(CALIBRATION.PALETTE.batoid);
      expect(material.flatShading).toBe(true);
    });

    describe('the wingbeat', () => {
      /** what three would hand onBeforeCompile for this material: its uniforms and the standard vertex source */
      const compiled = (flock: Flock): THREE.WebGLProgramParametersWithUniforms => {
        const shader = {
          uniforms: {},
          vertexShader: THREE.ShaderLib.physical.vertexShader,
          fragmentShader: THREE.ShaderLib.physical.fragmentShader,
        } as unknown as THREE.WebGLProgramParametersWithUniforms;
        flock.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
        return shader;
      };

      it('is spliced into the vertex shader, after the vertex is read and before it is moved', () => {
        // jsdom cannot compile GLSL, so this reads the source; `npm run build` and a browser are what compile it
        const { vertexShader } = compiled(cauldron());
        // the chunk that declares `transformed` from the vertex's position; three expands it at compile time
        const read = vertexShader.indexOf('#include <begin_vertex>');
        const beat = vertexShader.indexOf('transformed.y +=');
        const moved = vertexShader.indexOf('#include <project_vertex>');

        expect(vertexShader).toContain('uniform float uWingSeconds;');
        expect(read).toBeGreaterThan(-1);
        expect(beat).toBeGreaterThan(read);
        expect(moved).toBeGreaterThan(beat);
      });

      it('gives each bat its own phase, so the cauldron does not flap in unison', () => {
        expect(wingBeatChunk(0.62)).toContain('gl_InstanceID');
      });

      it('scales the reach by the real half-span, not a guess at it', () => {
        const flock = cauldron();
        flock.geometry.computeBoundingBox();
        const halfSpan = flock.geometry.boundingBox?.max.x ?? 0;

        expect(halfSpan).toBeGreaterThan(0);
        expect(compiled(flock).vertexShader).toContain(`/ ${halfSpan.toFixed(6)}`);
      });

      it('beats to the second it is handed, through the uniform the shader reads', () => {
        const flock = cauldron();
        const { uniforms } = compiled(flock);

        beatWings(flock, 2.5);

        expect(uniforms['uWingSeconds'].value).toBe(2.5);
      });

      it('keeps each cauldron on its own clock', () => {
        const first = cauldron();
        const second = cauldron();
        const a = compiled(first).uniforms;
        const b = compiled(second).uniforms;

        beatWings(first, 1);

        expect(a['uWingSeconds'].value).toBe(1);
        expect(b['uWingSeconds'].value).toBe(0);
      });
    });

    it('poses nothing: every bat is left at the identity until the flight is known', () => {
      const flock = cauldron();
      const identity = new THREE.Matrix4().toArray();

      for (let i = 0; i < flock.count; i++) {
        expect([...flock.instanceMatrix.array.slice(i * 16, i * 16 + 16)]).toEqual(identity);
      }
    });
  });

  describe('poseCauldron', () => {
    it('places bat i at the flight position at offset i * 3', () => {
      const flock = cauldron();
      const flight = flightOf(
        { position: { x: 0.25, y: -0.5, z: 1 }, velocity: { x: 1, y: 0, z: 0 } },
        { position: { x: -1.25, y: 0.125, z: -0.75 }, velocity: { x: 1, y: 0, z: 0 } }
      );

      poseCauldron(flight, flock, new THREE.Object3D());

      expectNear(poseOf(flock, 0).position, [0.25, -0.5, 1]);
      expectNear(poseOf(flock, 1).position, [-1.25, 0.125, -0.75]);
    });

    it('turns each bat to face along its velocity, in every quadrant', () => {
      const flock = cauldron();
      const flight = flightOf(
        ...HEADINGS.map((velocity) => ({ position: { x: 0, y: 0, z: 0 }, velocity }))
      );

      poseCauldron(flight, flock, new THREE.Object3D());

      HEADINGS.forEach((velocity, i) => {
        expectNear(poseOf(flock, i).facing, along(velocity));
      });
    });

    it('tips each bat up or down to face along a climbing or diving velocity', () => {
      const flock = cauldron();
      const flight = flightOf(
        ...PITCHED.map((velocity) => ({ position: { x: 0, y: 0, z: 0 }, velocity }))
      );

      poseCauldron(flight, flock, new THREE.Object3D());

      PITCHED.forEach((velocity, i) => {
        expectNear(poseOf(flock, i).facing, along(velocity));
      });
    });

    it('keeps the wings level while climbing or diving, so a bat pitches without rolling', () => {
      // local +x is the wing axis; column 0 (elements 0–2) is where it went
      const flock = cauldron();
      const flight = flightOf(
        ...PITCHED.map((velocity) => ({ position: { x: 0, y: 0, z: 0 }, velocity }))
      );

      poseCauldron(flight, flock, new THREE.Object3D());

      PITCHED.forEach((_, i) => {
        expect(flock.instanceMatrix.array[i * 16 + 1]).toBeCloseTo(0, DIGITS);
      });
    });

    it('banks each bat by its roll about its own nose, without turning where it faces', () => {
      const flock = cauldron();
      const flight = flightOf(
        ...PITCHED.map((velocity) => ({ position: { x: 0, y: 0, z: 0 }, velocity }))
      );
      const rolls = new Float32Array(CALIBRATION.CAULDRON.count).fill(-Math.PI / 6);

      poseCauldron(flight, flock, new THREE.Object3D(), rolls);

      PITCHED.forEach((velocity, i) => {
        expectNear(poseOf(flock, i).facing, along(velocity));
        // column 0 is the +x wing; a negative roll lowers it by sin(π/6) of the bat's scale
        const lift = flock.instanceMatrix.array[i * 16 + 1] / CALIBRATION.CAULDRON.batScale;
        expect(lift).toBeLessThan(0);
      });
    });

    it('banks a level bat by exactly its roll', () => {
      const flock = cauldron();
      const flight = flightOf({ position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 1 } });
      const rolls = new Float32Array(CALIBRATION.CAULDRON.count);
      rolls[0] = -Math.PI / 6;

      poseCauldron(flight, flock, new THREE.Object3D(), rolls);

      const lift = flock.instanceMatrix.array[1] / CALIBRATION.CAULDRON.batScale;
      expect(lift).toBeCloseTo(-0.5, DIGITS);
    });

    it('faces by direction alone, so a faster bat on the same heading faces the same way', () => {
      const flock = cauldron();
      const flight = flightOf(
        { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0.3, y: 0, z: 0.4 } },
        { position: { x: 0, y: 0, z: 0 }, velocity: { x: 3, y: 0, z: 4 } }
      );

      poseCauldron(flight, flock, new THREE.Object3D());

      expectNear(poseOf(flock, 1).facing, poseOf(flock, 0).facing);
    });

    it('shrinks every bat to the same size, so a cauldron of them does not overlap into one', () => {
      const flock = cauldron();

      poseCauldron(flightOf(), flock, new THREE.Object3D());

      for (let i = 0; i < flock.count; i++) {
        expect(poseOf(flock, i).scale).toBeCloseTo(CALIBRATION.CAULDRON.batScale, DIGITS);
      }
    });

    it('marks the instance buffer for upload on every call, or the GPU keeps the first frame', () => {
      // `needsUpdate = true` is a setter that bumps `version`; the renderer
      // re-uploads the buffer when the version has moved since its last upload.
      const flock = cauldron();
      const pose = new THREE.Object3D();
      const before = flock.instanceMatrix.version;

      poseCauldron(flightOf(), flock, pose);
      const once = flock.instanceMatrix.version;
      poseCauldron(flightOf(), flock, pose);

      expect(once).toBeGreaterThan(before);
      expect(flock.instanceMatrix.version).toBeGreaterThan(once);
    });

    it('reads the flight afresh each call, so a reused pose carries nothing between bats or frames', () => {
      const flock = cauldron();
      const pose = new THREE.Object3D();
      const flight = flightOf({ position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 1 } });

      poseCauldron(flight, flock, pose);
      flight.positions[0] = -1;
      poseCauldron(flight, flock, pose);

      expectNear(poseOf(flock, 0).position, [-1, 0, 0]);
      // bat 1 is at rest at the origin; it must not inherit bat 0's pose from the shared object
      expectNear(poseOf(flock, 1).position, [0, 0, 0]);
    });
  });
});
