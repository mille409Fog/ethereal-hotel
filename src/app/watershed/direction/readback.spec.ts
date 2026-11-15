import * as THREE from 'three';
import { ISimDriver } from '../sim/sim-driver';
import { createLandReader, READBACK_PASS } from './readback';
import {
  BLOCK_MOST,
  BLOCK_SIDE,
  BLOCK_SOURCE,
  BLOCK_WEIGHT,
  QUARTER,
  reductionSizes,
} from './readback-shaders';

interface IDraw {
  readonly target: THREE.WebGLRenderTarget | null;
  readonly source: unknown;
  readonly side: number;
  readonly weight: number;
}

/** records each draw: where it went, what it read, and the block it summed */
class FakeRenderer {
  public readonly draws: IDraw[] = [];
  public readonly bound = new THREE.WebGLRenderTarget(1, 1);
  private target: THREE.WebGLRenderTarget | null = this.bound;
  public readonly reads: Array<{ target: THREE.WebGLRenderTarget; width: number; height: number }> =
    [];

  public getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.target;
  }

  public setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
    this.target = target;
  }

  public render(scene: THREE.Scene): void {
    const { material } = scene.children[0] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.RawShaderMaterial
    >;
    expect(material.name).toBe(READBACK_PASS);
    this.draws.push({
      target: this.target,
      source: material.uniforms[BLOCK_SOURCE].value,
      side: material.uniforms[BLOCK_SIDE].value as number,
      weight: material.uniforms[BLOCK_WEIGHT].value as number,
    });
  }

  public readRenderTargetPixels(
    target: THREE.WebGLRenderTarget,
    _x: number,
    _y: number,
    width: number,
    height: number,
    buffer: Float32Array
  ): void {
    this.reads.push({ target, width, height });
    buffer.fill(2);
  }

  public readRenderTargetPixelsAsync(
    target: THREE.WebGLRenderTarget,
    _x: number,
    _y: number,
    width: number,
    height: number,
    buffer: Float32Array
  ): Promise<Float32Array> {
    this.reads.push({ target, width, height });
    buffer.set([1, 2, 3, 4]);
    return Promise.resolve(buffer);
  }
}

const SIZE = 512;
const land = new THREE.Texture();
const sim = { size: SIZE, current: (): THREE.Texture => land } as unknown as ISimDriver;

const build = (): { renderer: FakeRenderer; reader: ReturnType<typeof createLandReader> } => {
  const renderer = new FakeRenderer();
  return { renderer, reader: createLandReader(renderer as unknown as THREE.WebGLRenderer, sim) };
};

describe('reading the land back', () => {
  it('reduces a grid to one texel, a block of sixteen at a time', () => {
    expect(reductionSizes(512, BLOCK_MOST)).toEqual([32, 2, 1]);
    expect(reductionSizes(1024, BLOCK_MOST)).toEqual([64, 4, 1]);
    expect(reductionSizes(8, BLOCK_MOST)).toEqual([1]);
    expect(reductionSizes(1, BLOCK_MOST)).toEqual([1]);
  });

  it('sums the land down to one texel and reads that, without waiting for it', async () => {
    const { renderer, reader } = build();
    const sums = await reader.sums();

    expect(Array.from(sums)).toEqual([1, 2, 3, 4]);
    expect(renderer.draws.map((draw) => draw.target?.width)).toEqual([32, 2, 1]);
    expect(renderer.draws[0].source).toBe(land);
    expect(renderer.draws[1].source).toBe(renderer.draws[0].target?.texture);
    expect(renderer.draws.every((draw) => draw.weight === 1 && draw.side === BLOCK_MOST)).toBe(
      true
    );
    expect(renderer.reads).toEqual([{ target: renderer.draws[2].target, width: 1, height: 1 }]);
  });

  it('copies the land at a quarter of its side, as the mean of each block, and reads it at once', () => {
    const { renderer, reader } = build();
    const copy = reader.quarter();

    expect(reader.quarterSize).toBe(SIZE / QUARTER);
    expect(copy).toHaveLength((SIZE / QUARTER) ** 2 * 4);
    expect(renderer.draws).toEqual([
      expect.objectContaining({ source: land, side: QUARTER, weight: 1 / QUARTER ** 2 }),
    ]);
    expect(renderer.reads[0]).toEqual(
      expect.objectContaining({ width: SIZE / QUARTER, height: SIZE / QUARTER })
    );
  });

  it('hands back whatever target was bound, after either read', async () => {
    const { renderer, reader } = build();
    await reader.sums();
    expect(renderer.getRenderTarget()).toBe(renderer.bound);
    reader.quarter();
    expect(renderer.getRenderTarget()).toBe(renderer.bound);
  });

  it('writes only to targets of its own, never to the simulation’s', async () => {
    const { renderer, reader } = build();
    await reader.sums();
    reader.quarter();

    expect(renderer.draws.every((draw) => draw.target?.texture !== land)).toBe(true);
    expect(renderer.draws.every((draw) => draw.target?.texture.type === THREE.FloatType)).toBe(
      true
    );
  });

  it('frees every target it made', () => {
    const { reader } = build();
    const freed = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');
    reader.dispose();

    expect(freed).toHaveBeenCalledTimes(reductionSizes(SIZE, BLOCK_MOST).length + 1);
    freed.mockRestore();
  });
});
