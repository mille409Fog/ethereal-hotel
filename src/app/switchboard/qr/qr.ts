/**
 * A QR code encoder for `/switchboard`'s `waiting` screen: byte mode, error
 * correction level M, versions 1 to 4. Written against ISO/IEC 18004 rather
 * than taken as a dependency (SWITCHBOARD.md §Decisions), and a leaf: it
 * imports nothing, so Node can load it as well as the app.
 *
 * **Versions 1 to 4 and nothing larger, on purpose.** Version 4-M holds 62
 * bytes, and the URL it carries is `<origin>/switchboard?code=XXXXXX`, 46 bytes
 * on the production domain. Version 5 is where the code gains unequal blocks,
 * and version 7 is where it gains version-information areas, so stopping at 4
 * keeps the whole encoder one block layout and one placement routine. A longer
 * origin (a Vercel preview URL runs past 80 bytes) gets a `RangeError`, and the
 * page says it cannot draw the code there rather than drawing a larger one.
 *
 * `qr.spec.ts` holds the evidence: Reed–Solomon codewords for a worked example
 * of the standard's, and whole matrices produced by an independent encoder,
 * each with the mask fixed so the comparison covers placement and masking bit
 * for bit. The mask is otherwise chosen by the standard's four penalty rules.
 * Mask choice does not affect whether a code scans, because any of the eight
 * masks decodes; it only affects how easily.
 *
 * Coordinates are `modules[row][column]`, row 0 at the top. Dark is `true`.
 */

/** One version's block layout at level M. */
interface IVersionLayout {
  /** Data codewords across all blocks. */
  dataCodewords: number;
  /** Error-correction codewords in each block. */
  ecPerBlock: number;
  /** Blocks, each holding an equal share of the data. */
  blocks: number;
  /** The second alignment-pattern coordinate; `null` in version 1, which has none. */
  alignment: number | null;
}

/** ISO/IEC 18004 Table 9 (level M) and Annex E, versions 1 to 4. */
const LAYOUTS: readonly IVersionLayout[] = [
  { dataCodewords: 16, ecPerBlock: 10, blocks: 1, alignment: null },
  { dataCodewords: 28, ecPerBlock: 16, blocks: 1, alignment: 18 },
  { dataCodewords: 44, ecPerBlock: 26, blocks: 1, alignment: 22 },
  { dataCodewords: 64, ecPerBlock: 18, blocks: 2, alignment: 26 },
];

/** The byte-mode indicator (4 bits) and an 8-bit character count, which versions 1 to 9 use. */
const HEADER_BITS = 12;

/** The most bytes version 4-M carries. */
export const MAX_QR_BYTES = Math.floor((LAYOUTS[3].dataCodewords * 8 - HEADER_BITS) / 8);

/** An encoded symbol, without its quiet zone. */
export interface IQrCode {
  version: number;
  mask: number;
  /** Modules per side: `17 + 4 × version`. */
  size: number;
  modules: ReadonlyArray<readonly boolean[]>;
}

// ===== Reed–Solomon over GF(256), polynomial x^8 + x^4 + x^3 + x^2 + 1 =====

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let value = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    EXP[i] = EXP[i - 255];
  }
}

function multiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial of degree `degree`, highest coefficient first. */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    poly.forEach((coefficient, j) => {
      next[j] ^= coefficient;
      next[j + 1] ^= multiply(coefficient, EXP[i]);
    });
    poly = next;
  }
  return poly;
}

/** The `count` error-correction codewords for `data`. */
export function reedSolomon(data: readonly number[], count: number): number[] {
  const gen = generator(count);
  const remainder = new Array<number>(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ (remainder.shift() as number);
    remainder.push(0);
    for (let j = 0; j < count; j++) {
      remainder[j] ^= multiply(gen[j + 1], factor);
    }
  }
  return remainder;
}

// ===== Codewords =====

/** Byte mode, the count, the bytes, the terminator, then 0xEC 0x11 padding to capacity. */
function dataCodewords(bytes: Uint8Array, capacity: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  bytes.forEach((byte) => push(byte, 8));
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }
  for (let pad = 0xec; codewords.length < capacity; pad ^= 0xec ^ 0x11) {
    codewords.push(pad);
  }
  return codewords;
}

/** Split into blocks, add each block's error correction, and interleave. */
function finalCodewords(data: readonly number[], layout: IVersionLayout): number[] {
  const share = layout.dataCodewords / layout.blocks;
  const blocks = Array.from({ length: layout.blocks }, (_, b) =>
    data.slice(b * share, (b + 1) * share)
  );
  const ec = blocks.map((block) => reedSolomon(block, layout.ecPerBlock));
  const out: number[] = [];
  for (let i = 0; i < share; i++) {
    blocks.forEach((block) => out.push(block[i]));
  }
  for (let i = 0; i < layout.ecPerBlock; i++) {
    ec.forEach((block) => out.push(block[i]));
  }
  return out;
}

// ===== The matrix =====

type Grid = boolean[][];

function grid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

/** The 15 format bits for level M (`00`) and `mask`: BCH(15, 5), then the fixed XOR. */
export function formatBits(mask: number): number {
  const data = mask; // level M is 0b00, so the five data bits are the mask alone
  let remainder = data;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

/** Writes function modules and marks them reserved, so data and masking skip them. */
class Matrix {
  public readonly size: number;
  public readonly modules: Grid;
  public readonly reserved: Grid;

  // No parameter property: Node strips types but does not transform them away.
  constructor(size: number) {
    this.size = size;
    this.modules = grid(size);
    this.reserved = grid(size);
  }

  public set(row: number, column: number, dark: boolean): void {
    this.modules[row][column] = dark;
    this.reserved[row][column] = true;
  }

  /** A finder pattern with its separator, centred at (`row`, `column`). */
  public finder(row: number, column: number): void {
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const r = row + dr;
        const c = column + dc;
        if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          this.set(r, c, ring !== 2 && ring !== 4);
        }
      }
    }
  }

  public alignment(row: number, column: number): void {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        this.set(row + dr, column + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }
  }

  /** Both copies of the format information, and the dark module beside the lower one. */
  public format(mask: number): void {
    const bits = formatBits(mask);
    const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;
    const last = this.size - 1;
    for (let i = 0; i <= 5; i++) {
      this.set(i, 8, bit(i));
    }
    this.set(7, 8, bit(6));
    this.set(8, 8, bit(7));
    this.set(8, 7, bit(8));
    for (let i = 9; i < 15; i++) {
      this.set(8, 14 - i, bit(i));
    }
    for (let i = 0; i < 8; i++) {
      this.set(8, last - i, bit(i));
    }
    for (let i = 8; i < 15; i++) {
      this.set(this.size - 15 + i, 8, bit(i));
    }
    this.set(this.size - 8, 8, true);
  }
}

function functionPatterns(version: number): Matrix {
  const symbol = new Matrix(17 + 4 * version);
  const size = symbol.size;
  for (let i = 0; i < size; i++) {
    symbol.set(6, i, i % 2 === 0);
    symbol.set(i, 6, i % 2 === 0);
  }
  symbol.finder(3, 3);
  symbol.finder(3, size - 4);
  symbol.finder(size - 4, 3);
  const second = LAYOUTS[version - 1].alignment;
  if (second !== null) {
    // At versions 2 to 4 the only centre not under a finder is (second, second).
    symbol.alignment(second, second);
  }
  symbol.format(0); // reserves the area; drawn for real once the mask is chosen
  return symbol;
}

/** Two-module columns, right to left, alternating upward and downward, skipping the timing column. */
function dataPositions(symbol: Matrix): Array<[number, number]> {
  const size = symbol.size;
  const order: Array<[number, number]> = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      order.push([row, right], [row, right - 1]);
    }
  }
  return order.filter(([row, column]) => !symbol.reserved[row][column]);
}

/** The codewords' bits, most significant first; the remainder bits past them stay light. */
function placeData(symbol: Matrix, codewords: readonly number[]): void {
  const total = codewords.length * 8;
  dataPositions(symbol).forEach(([row, column], i) => {
    symbol.modules[row][column] = i < total && ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
  });
}

const MASKS: ReadonlyArray<(row: number, column: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function masked(symbol: Matrix, mask: number): Grid {
  const out = symbol.modules.map((row, r) =>
    row.map((dark, c) => (symbol.reserved[r][c] ? dark : dark !== MASKS[mask](r, c)))
  );
  const withFormat = new Matrix(symbol.size);
  withFormat.format(mask);
  withFormat.reserved.forEach((row, r) =>
    row.forEach((isFormat, c) => {
      if (isFormat) {
        out[r][c] = withFormat.modules[r][c];
      }
    })
  );
  return out;
}

// ===== Mask penalty, ISO/IEC 18004 §7.8.3 =====

/** Rows and columns, so each line rule is written once. */
function lines(modules: Grid): boolean[][] {
  return [...modules, ...modules.map((_, c) => modules.map((row) => row[c]))];
}

/** N1: 3 for a run of five same-coloured modules, plus 1 for each module past five. */
function runPenalty(line: readonly boolean[]): number {
  let penalty = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) {
      run++;
      continue;
    }
    if (run >= 5) {
      penalty += run - 2;
    }
    run = 1;
  }
  return penalty;
}

const FINDER_LIKE = [true, false, true, true, true, false, true];

/** N3: 40 for each 1:1:3:1:1 dark run with four light modules on one side. Beyond the edge is quiet zone, so light. */
export function finderPenalty(line: readonly boolean[]): number {
  const light = (from: number): boolean => [0, 1, 2, 3].every((k) => line[from + k] !== true);
  let penalty = 0;
  for (let i = 0; i + 7 <= line.length; i++) {
    if (FINDER_LIKE.every((dark, k) => line[i + k] === dark) && (light(i - 4) || light(i + 7))) {
      penalty += 40;
    }
  }
  return penalty;
}

export function penalty(modules: Grid): number {
  let total = 0;
  for (const line of lines(modules)) {
    total += runPenalty(line) + finderPenalty(line);
  }
  const size = modules.length;
  let dark = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      dark += modules[r][c] ? 1 : 0;
      const colour = modules[r][c];
      if (
        r + 1 < size &&
        c + 1 < size &&
        modules[r][c + 1] === colour &&
        modules[r + 1][c] === colour &&
        modules[r + 1][c + 1] === colour
      ) {
        total += 3; // N2
      }
    }
  }
  // N4: 10 for each full 5% the dark proportion strays from 50%.
  total += 10 * Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5);
  return total;
}

// ===== The encoder =====

/**
 * Encode `text` as UTF-8 in the smallest version from 1 to 4 that holds it.
 *
 * @param mask Fix the mask instead of choosing the one with the lowest penalty.
 *   For the spec's reference vectors, which must compare bit for bit.
 * @throws RangeError when the text is longer than {@link MAX_QR_BYTES} bytes.
 */
export function encodeQr(text: string, mask?: number): IQrCode {
  const bytes = new TextEncoder().encode(text);
  const index = LAYOUTS.findIndex(
    (layout) => HEADER_BITS + bytes.length * 8 <= layout.dataCodewords * 8
  );
  if (index === -1) {
    throw new RangeError(
      `${bytes.length} bytes is more than a version 4-M code holds (${MAX_QR_BYTES}).`
    );
  }
  const version = index + 1;
  const layout = LAYOUTS[index];
  const symbol = functionPatterns(version);
  placeData(symbol, finalCodewords(dataCodewords(bytes, layout.dataCodewords), layout));

  const candidates = mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [mask];
  let best: { mask: number; modules: Grid; penalty: number } | null = null;
  for (const candidate of candidates) {
    const modules = masked(symbol, candidate);
    const score = penalty(modules);
    if (best === null || score < best.penalty) {
      best = { mask: candidate, modules, penalty: score };
    }
  }
  const chosen = best as { mask: number; modules: Grid };
  return { version, mask: chosen.mask, size: symbol.size, modules: chosen.modules };
}

/**
 * One SVG path for every dark module, a run of them per subpath, offset by a
 * quiet zone of `quiet` modules. Draw it in a `viewBox` of `size + 2 × quiet`.
 */
export function qrPath(code: IQrCode, quiet = 4): string {
  const parts: string[] = [];
  code.modules.forEach((row, r) => {
    let start = -1;
    for (let c = 0; c <= row.length; c++) {
      if (c < row.length && row[c]) {
        start = start === -1 ? c : start;
      } else if (start !== -1) {
        parts.push(`M${start + quiet} ${r + quiet}h${c - start}v1h${start - c}z`);
        start = -1;
      }
    }
  });
  return parts.join('');
}
