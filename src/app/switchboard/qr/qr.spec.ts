import {
  encodeQr,
  finderPenalty,
  formatBits,
  MAX_QR_BYTES,
  penalty,
  qrPath,
  reedSolomon,
} from './qr';
import { QR_VECTORS } from './qr-vectors.testing';

/**
 * The encoder is held to the standard by evidence from outside it: the
 * standard's own worked example for Reed–Solomon, its format-information
 * table, and whole matrices from an independent encoder
 * (`qr-vectors.testing.ts` has their provenance). What none of these can fix
 * is the mask an encoder chooses for itself, because implementations score the
 * penalty rules differently; any mask decodes, so that is tested as being
 * this encoder's own lowest penalty and no more.
 */

const toRows = (modules: ReadonlyArray<readonly boolean[]>): string[] =>
  modules.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''));

const fromRows = (rows: readonly string[]): boolean[][] =>
  rows.map((row) => [...row].map((cell) => cell === '#'));

describe('reedSolomon', () => {
  it("matches ISO/IEC 18004 Annex I's worked example, 01234567 at 1-M", () => {
    const data = [16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17];
    expect(reedSolomon(data, 10)).toEqual([165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
  });

  it('matches the widely published HELLO WORLD at 1-M', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomon(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
});

describe('formatBits', () => {
  it("is the standard's table for level M, all eight masks", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((mask) => formatBits(mask).toString(2))).toEqual([
      '101010000010010',
      '101000100100101',
      '101111001111100',
      '101101101001011',
      '100010111111001',
      '100000011001110',
      '100111110010111',
      '100101010100000',
    ]);
  });
});

describe('encodeQr', () => {
  for (const vector of QR_VECTORS) {
    it(`matches the reference matrix for ${JSON.stringify(vector.text)} (version ${vector.version}, mask ${vector.mask})`, () => {
      const code = encodeQr(vector.text, vector.mask);
      expect(code.version).toBe(vector.version);
      expect(code.mask).toBe(vector.mask);
      expect(code.size).toBe(17 + 4 * vector.version);
      expect(toRows(code.modules)).toEqual(vector.rows);
    });
  }

  it('picks the smallest version that holds the bytes, counting UTF-8 bytes rather than characters', () => {
    expect(encodeQr('x'.repeat(14)).version).toBe(1);
    expect(encodeQr('x'.repeat(15)).version).toBe(2);
    expect(encodeQr('x'.repeat(42)).version).toBe(3);
    expect(encodeQr('x'.repeat(43)).version).toBe(4);
    expect(encodeQr('é'.repeat(7)).version).toBe(1);
    expect(encodeQr('é'.repeat(8)).version).toBe(2);
  });

  it('refuses more than version 4-M holds, so the page can say so', () => {
    expect(MAX_QR_BYTES).toBe(62);
    expect(encodeQr('x'.repeat(62)).version).toBe(4);
    expect(() => encodeQr('x'.repeat(63))).toThrow(RangeError);
    expect(() => encodeQr('é'.repeat(32))).toThrow('64 bytes');
  });

  it('chooses the mask with its own lowest penalty, the first on a tie', () => {
    for (const text of QR_VECTORS.map((vector) => vector.text)) {
      const scores = [0, 1, 2, 3, 4, 5, 6, 7].map((mask) =>
        penalty(fromRows(toRows(encodeQr(text, mask).modules)))
      );
      expect(encodeQr(text).mask).toBe(scores.indexOf(Math.min(...scores)));
    }
  });
});

describe('penalty', () => {
  it('scores a light square on runs, blocks and balance', () => {
    // N1: ten lines of five, 3 each. N2: sixteen 2×2 blocks, 3 each. N4: 0% dark is ten steps from 50%.
    expect(penalty(fromRows(['.....', '.....', '.....', '.....', '.....']))).toBe(30 + 48 + 100);
  });

  it('scores a checkerboard at nothing', () => {
    const rows = Array.from({ length: 6 }, (_, r) => (r % 2 === 0 ? '#.#.#.' : '.#.#.#'));
    expect(penalty(fromRows(rows))).toBe(0);
  });
});

describe('finderPenalty', () => {
  const line = (text: string): boolean[] => [...text].map((cell) => cell === '#');

  it('charges 40 for 1:1:3:1:1 with four light modules after it, or before it', () => {
    expect(finderPenalty(line('#.###.#....#'))).toBe(40);
    expect(finderPenalty(line('#....#.###.#'))).toBe(40);
  });

  it('counts beyond the edge as light, because that is the quiet zone', () => {
    expect(finderPenalty(line('#.###.#'))).toBe(40);
  });

  it('charges nothing when dark modules crowd both sides', () => {
    expect(finderPenalty(line('##.#.###.#.##'))).toBe(0);
    expect(finderPenalty(line('#.##..#....'))).toBe(0);
  });
});

describe('qrPath', () => {
  it('draws one subpath per run of dark modules, inside a quiet zone', () => {
    const code = encodeQr('ABC234', 3);
    const path = qrPath(code);
    expect(path.startsWith('M4 4h7v1h-7z')).toBe(true);

    const dark = code.modules.flat().filter(Boolean).length;
    const drawn = [...path.matchAll(/h(\d+)v1/g)].reduce((sum, match) => sum + Number(match[1]), 0);
    expect(drawn).toBe(dark);
  });

  it('takes the quiet zone as an argument', () => {
    expect(qrPath(encodeQr('ABC234', 3), 0).startsWith('M0 0h7v1h-7z')).toBe(true);
  });
});
