// Renders src/brand.ts into nearest-neighbour PNGs: `node scripts/icons.ts`
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { brandPalette, brandRows } from "../src/brand.ts";

const outDir = new URL("../public/icons/", import.meta.url);
// 128 = 96px artwork + 16px padding per side, as the Chrome Web Store recommends.
const targets = [
  { size: 16, scale: 1 },
  { size: 32, scale: 2 },
  { size: 48, scale: 3 },
  { size: 128, scale: 6 },
];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer) {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function rgba(char: string) {
  const hex = brandPalette[char];
  if (!hex) return [0, 0, 0, 0];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);
}

function render(size: number, scale: number) {
  const art = brandRows.length * scale;
  const offset = (size - art) / 2;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const ay = Math.floor((y - offset) / scale);
      const ax = Math.floor((x - offset) / scale);
      const char = brandRows[ay]?.[ax] ?? ".";
      Buffer.from(rgba(char)).copy(raw, row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const { size, scale } of targets) {
  writeFileSync(new URL(`icon-${size}.png`, outDir), render(size, scale));
}
console.log(`icons written to ${outDir.pathname}`);
