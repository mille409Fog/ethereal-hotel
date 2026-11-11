import { EROSION } from '../model/erosion-calibration';
import { createFields } from '../model/fields';
import { raise } from '../model/reference';
import { HERO_SEED } from '../seed/seed';
import { CHANNELS, packLand, packStrata, packTerrain, unpackLand } from './sim-layout';
import { SIM_CONSTANTS, SIM_PASSES, SIM_STATES, SIM_STRENGTH } from './sim-shaders';

const SIZE = 8;

describe('sim layout', () => {
  it('packs the land as raised into red and its strata warp into green', () => {
    const { terrain } = raise(HERO_SEED, SIZE);
    const packed = packTerrain(terrain);

    expect(packed).toHaveLength(SIZE * SIZE * CHANNELS);
    expect(packed[20 * CHANNELS]).toBe(terrain.uplift[20]);
    expect(packed[20 * CHANNELS + 1]).toBe(terrain.warp[20]);
    expect(packed[20 * CHANNELS + 2]).toBe(0);
  });

  it('packs a bed’s colour into red, green and blue and its erodibility into alpha', () => {
    const { strata } = raise(HERO_SEED, SIZE);
    const packed = packStrata(strata);

    expect(packed).toHaveLength(strata.erodibility.length * CHANNELS);
    expect([...packed.slice(7 * CHANNELS, 7 * CHANNELS + 3)]).toEqual([
      ...strata.colours.slice(21, 24),
    ]);
    expect(packed[7 * CHANNELS + 3]).toBe(strata.erodibility[7]);
  });

  it('packs the four fields of the land in the order the shaders name them', () => {
    const fields = createFields(SIZE);
    fields.cut[3] = 1;
    fields.regolith[3] = 2;
    fields.water[3] = 3;
    fields.suspended[3] = 4;

    expect([...packLand(fields).slice(3 * CHANNELS, 4 * CHANNELS)]).toEqual([1, 2, 3, 4]);
  });

  it('unpacks what it packed, so a land read back from the GPU lands in the fields it left', () => {
    const fields = createFields(SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
      fields.cut[i] = i;
      fields.regolith[i] = i * 0.5;
      fields.water[i] = i * 0.25;
      fields.suspended[i] = i * 0.125;
    }
    const back = createFields(SIZE);
    unpackLand(packLand(fields), back);

    expect(back.cut).toEqual(fields.cut);
    expect(back.regolith).toEqual(fields.regolith);
    expect(back.water).toEqual(fields.water);
    expect(back.suspended).toEqual(fields.suspended);
  });
});

/**
 * what can be said about the shaders without a compiler. whether they compile, and whether they compute the
 * model, is `scripts/verify-watershed.mjs`'s to say; these are the properties of the table both drivers trust.
 */
describe('sim passes', () => {
  it('reads only textures that exist, and writes only state', () => {
    const sources = new Set<string>([...SIM_STATES, 'terrain', 'strata']);
    for (const pass of SIM_PASSES) {
      expect(SIM_STATES).toContain(pass.writes);
      for (const source of pass.reads) {
        expect(sources.has(source)).toBe(true);
      }
    }
  });

  it('lists the velocity and the slump among a pass’s reads exactly when its shader fetches them', () => {
    // these two are fetched only in a pass's own body, never in the shared helpers, so the source can be asked.
    // a pass that fetched one without listing it would be handed no texture and read zeros, and still compile
    for (const pass of SIM_PASSES) {
      for (const source of ['flow', 'slump'] as const) {
        expect(pass.fragment.includes(`texelFetch(${source},`)).toBe(pass.reads.includes(source));
      }
    }
  });

  it('reads the land in every pass, since every pass takes the grid’s size from it', () => {
    for (const pass of SIM_PASSES) {
      expect(pass.reads).toContain('land');
    }
  });

  it('writes every state texture at least once a step, so none is left stale', () => {
    for (const state of SIM_STATES) {
      expect(SIM_PASSES.some((pass) => pass.writes === state)).toBe(true);
    }
  });

  it('moves the water’s velocity before its depth, while the depth is still what it flowed from', () => {
    const names = SIM_PASSES.map((pass) => pass.name);

    expect(names.indexOf('flow: velocity')).toBeLessThan(names.indexOf('flow: depth'));
    expect(names.indexOf('carry')).toBeLessThan(names.indexOf('flow: depth'));
    expect(names.indexOf('pipeFlux')).toBeLessThan(names.indexOf('carry'));
  });

  it('declares a uniform for every constant it lists, and for the rain', () => {
    const { fragment } = SIM_PASSES[0];
    for (const key of SIM_CONSTANTS) {
      expect(fragment).toContain(`uniform float ${key};`);
      expect(EROSION[key]).toEqual(expect.any(Number));
    }

    expect(fragment).toContain(`uniform float ${SIM_STRENGTH};`);
  });

  it('never filters the state: every fetch is a texel fetch', () => {
    for (const pass of SIM_PASSES) {
      expect(pass.fragment).not.toMatch(/\btexture(2D|Lod)?\s*\(/);
    }
  });

  it('leaves the version line to whoever compiles it', () => {
    for (const pass of SIM_PASSES) {
      expect(pass.fragment).not.toContain('#version');
    }
  });
});
