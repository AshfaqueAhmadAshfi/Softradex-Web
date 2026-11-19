/**
 * Self-contained ISO/IEC 18004 QR Code encoder (ECC Level M, Byte mode, Versions 1-6).
 * Produces a 2D boolean matrix and crisp SVG markup without external dependencies.
 */

interface QrVersionSpec {
  version: number;
  size: number;
  align: number[];
  dataCodewords: number;
  ecPerBlock: number;
  blocksGroup1: number;
  blockDataGroup1: number;
  blocksGroup2: number;
  blockDataGroup2: number;
}

const VERSIONS: QrVersionSpec[] = [
  { version: 1, size: 21, align: [], dataCodewords: 16, ecPerBlock: 10, blocksGroup1: 1, blockDataGroup1: 16, blocksGroup2: 0, blockDataGroup2: 0 },
  { version: 2, size: 25, align: [6, 18], dataCodewords: 28, ecPerBlock: 16, blocksGroup1: 1, blockDataGroup1: 28, blocksGroup2: 0, blockDataGroup2: 0 },
  { version: 3, size: 29, align: [6, 22], dataCodewords: 44, ecPerBlock: 26, blocksGroup1: 1, blockDataGroup1: 44, blocksGroup2: 0, blockDataGroup2: 0 },
  { version: 4, size: 33, align: [6, 26], dataCodewords: 64, ecPerBlock: 18, blocksGroup1: 2, blockDataGroup1: 32, blocksGroup2: 0, blockDataGroup2: 0 },
  { version: 5, size: 37, align: [6, 30], dataCodewords: 86, ecPerBlock: 24, blocksGroup1: 2, blockDataGroup1: 43, blocksGroup2: 0, blockDataGroup2: 0 },
  { version: 6, size: 41, align: [6, 34], dataCodewords: 108, ecPerBlock: 16, blocksGroup1: 4, blockDataGroup1: 27, blocksGroup2: 0, blockDataGroup2: 0 }
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildRsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function computeRsRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = buildRsGenerator(ecCount);
  const work = new Uint8Array(data.length + ecCount);
  work.set(data);
  for (let i = 0; i < data.length; i += 1) {
    const coef = work[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j += 1) {
      work[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return work.slice(data.length);
}

function pickVersion(byteLen: number): QrVersionSpec {
  // Byte mode header for V1..V6: 4-bit mode (0100) + 8-bit length + 4-bit terminator = 2 overhead bytes
  const found = VERSIONS.find((v) => byteLen <= v.dataCodewords - 2);
  if (!found) {
    throw new Error(`QR payload too long (${byteLen} bytes)`);
  }
  return found;
}

function encodeDataCodewords(bytes: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number): void => {
    for (let i = len - 1; i >= 0; i -= 1) {
      bits.push((val >>> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);

  const maxBits = spec.dataCodewords * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminatorLen; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < bits.length / 8; i += 1) {
    let cw = 0;
    for (let b = 0; b < 8; b += 1) cw = (cw << 1) | bits[i * 8 + b];
    codewords[i] = cw;
  }

  let padToggle = 0;
  for (let i = bits.length / 8; i < spec.dataCodewords; i += 1) {
    codewords[i] = padToggle === 0 ? 0xec : 0x11;
    padToggle ^= 1;
  }
  return codewords;
}

function interleaveCodewords(data: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const blocks: Uint8Array[] = [];
  const ecs: Uint8Array[] = [];
  let offset = 0;

  const appendBlocks = (count: number, blockLen: number): void => {
    for (let i = 0; i < count; i += 1) {
      const slice = data.slice(offset, offset + blockLen);
      offset += blockLen;
      blocks.push(slice);
      ecs.push(computeRsRemainder(slice, spec.ecPerBlock));
    }
  };

  appendBlocks(spec.blocksGroup1, spec.blockDataGroup1);
  appendBlocks(spec.blocksGroup2, spec.blockDataGroup2);

  const out: number[] = [];
  const maxDataLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const b of blocks) {
      if (i < b.length) out.push(b[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const ec of ecs) out.push(ec[i]);
  }
  return new Uint8Array(out);
}

function bchFormatBits(maskPattern: number): number {
  // ECC Level M = 00
  const data = (0b00 << 3) | (maskPattern & 0x7);
  let rem = data << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if ((rem >>> (i + 10)) & 1) {
      rem ^= 0x537 << i;
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

interface MatrixBoard {
  size: number;
  modules: boolean[][];
  reserved: boolean[][];
}

function createBoard(spec: QrVersionSpec): MatrixBoard {
  const { size, align } = spec;
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFixed = (r: number, c: number, dark: boolean): void => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      reserved[r][c] = true;
    }
  };

  const placeFinder = (top: number, left: number): void => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const onOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const dark = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (onOuter || inCore);
        setFixed(r, c, dark);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    setFixed(6, i, i % 2 === 0);
    setFixed(i, 6, i % 2 === 0);
  }

  for (const rCenter of align) {
    for (const cCenter of align) {
      let overlaps = false;
      for (let dr = -2; dr <= 2 && !overlaps; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          if (reserved[rCenter + dr][cCenter + dc]) overlaps = true;
        }
      }
      if (overlaps) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFixed(rCenter + dr, cCenter + dc, dark);
        }
      }
    }
  }

  // Reserve format info zones + dark module
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    if (i < 7) reserved[size - 1 - i][8] = true;
  }
  setFixed(size - 8, 8, true);

  return { size, modules, reserved };
}

function writeFormatInfo(board: MatrixBoard, mask: number): void {
  const bits = bchFormatBits(mask);
  const { size, modules } = board;
  for (let i = 0; i <= 5; i += 1) {
    const bit = ((bits >>> i) & 1) === 1;
    modules[8][i] = bit;
    modules[size - 1 - i][8] = bit;
  }
  modules[8][7] = ((bits >>> 6) & 1) === 1;
  modules[size - 7][8] = ((bits >>> 6) & 1) === 1;
  modules[8][8] = ((bits >>> 7) & 1) === 1;
  modules[8][size - 8] = ((bits >>> 7) & 1) === 1;
  modules[7][8] = ((bits >>> 8) & 1) === 1;
  modules[8][size - 7] = ((bits >>> 8) & 1) === 1;
  for (let i = 9; i <= 14; i += 1) {
    const bit = ((bits >>> i) & 1) === 1;
    modules[14 - i][8] = bit;
    modules[8][size - 15 + i] = bit;
  }
}

function placeAndMaskData(board: MatrixBoard, stream: Uint8Array): void {
  const { size, reserved } = board;
  const raw = board.modules.map((row) => [...row]);

  let bitIdx = 0;
  const totalBits = stream.length * 8;
  let dirUp = true;

  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    for (let step = 0; step < size; step += 1) {
      const r = dirUp ? size - 1 - step : step;
      for (const dc of [0, -1]) {
        const c = rightCol + dc;
        if (!reserved[r][c]) {
          const bytePos = bitIdx >>> 3;
          const bitOffset = 7 - (bitIdx & 7);
          raw[r][c] = bitIdx < totalBits ? ((stream[bytePos] >>> bitOffset) & 1) === 1 : false;
          bitIdx += 1;
        }
      }
    }
    dirUp = !dirUp;
  }

  const maskFn = [
    (r: number, c: number) => (r + c) % 2 === 0,
    (r: number) => r % 2 === 0,
    (_r: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules: boolean[][] = raw;

  for (let m = 0; m < 8; m += 1) {
    const cand = raw.map((row, r) =>
      row.map((val, c) => (reserved[r][c] ? val : maskFn[m](r, c) ? !val : val))
    );
    writeFormatInfo({ size, modules: cand, reserved }, m);
    const penalty = evaluatePenalty(cand);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = m;
      bestModules = cand;
    }
  }

  board.modules = bestModules;
  writeFormatInfo(board, bestMask);
}

function evaluatePenalty(grid: boolean[][]): number {
  const n = grid.length;
  let penalty = 0;

  // Rule 1: 5+ consecutive same-color modules
  for (let r = 0; r < n; r += 1) {
    let rowRun = 1;
    let colRun = 1;
    for (let c = 1; c < n; c += 1) {
      if (grid[r][c] === grid[r][c - 1]) rowRun += 1;
      else {
        if (rowRun >= 5) penalty += rowRun - 2;
        rowRun = 1;
      }
      if (grid[c][r] === grid[c - 1][r]) colRun += 1;
      else {
        if (colRun >= 5) penalty += colRun - 2;
        colRun = 1;
      }
    }
    if (rowRun >= 5) penalty += rowRun - 2;
    if (colRun >= 5) penalty += colRun - 2;
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = grid[r][c];
      if (grid[r][c + 1] === v && grid[r + 1][c] === v && grid[r + 1][c + 1] === v) {
        penalty += 3;
      }
    }
  }

  // Rule 4: Dark ratio balance
  let darkCount = 0;
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (grid[r][c]) darkCount += 1;
    }
  }
  const pct = (darkCount * 100) / (n * n);
  const k = Math.floor(Math.abs(pct - 50) / 5);
  penalty += k * 10;

  return penalty;
}

export function encodeQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec = pickVersion(bytes.length);
  const data = encodeDataCodewords(bytes, spec);
  const stream = interleaveCodewords(data, spec);
  const board = createBoard(spec);
  placeAndMaskData(board, stream);
  return board.modules;
}

export function renderQrSvg(text: string, label = 'QR Code'): string {
  const matrix = encodeQrMatrix(text);
  const quiet = 3;
  const total = matrix.length + quiet * 2;
  const rects: string[] = [];

  for (let r = 0; r < matrix.length; r += 1) {
    for (let c = 0; c < matrix.length; c += 1) {
      if (matrix[r][c]) {
        rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`);
      }
    }
  }

  const safeLabel = label.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="${safeLabel}"><rect width="${total}" height="${total}" fill="#ffffff"/><g fill="#081b15">${rects.join('')}</g></svg>`;
}
