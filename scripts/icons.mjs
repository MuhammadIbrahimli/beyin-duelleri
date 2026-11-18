// Generates the flat PWA icons (public/icon-192.png, icon-512.png, icon-maskable-512.png) with no dependencies.
// Run once: node scripts/icons.mjs. Replace the PNGs with the channel's real logo when it exists.
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [11, 12, 17];       // --c-bg
const YELLOW = [255, 210, 63]; // --c-primary
const GREEN = [61, 220, 151];  // --c-exp-refleks

function png(size, { safe }) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const r = size * (safe ? 0.22 : 0.3); // maskable icons keep the mark inside the safe zone
  const c1 = [size * 0.4, size * 0.5], c2 = [size * 0.6, size * 0.5];
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    px[row] = 0;
    for (let x = 0; x < size; x++) {
      const d1 = Math.hypot(x - c1[0], y - c1[1]), d2 = Math.hypot(x - c2[0], y - c2[1]);
      const col = d1 < r && d2 < r ? BG : d1 < r ? YELLOW : d2 < r ? GREEN : BG; // two "dueling" discs
      px.set([...col, 255], row + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", png(192, { safe: false }));
writeFileSync("public/icon-512.png", png(512, { safe: false }));
writeFileSync("public/icon-maskable-512.png", png(512, { safe: true }));
console.log("icons written to public/");
