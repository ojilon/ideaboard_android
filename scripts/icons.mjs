import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Tiny PNG renderer, no dependencies: draws rounded rectangles into an RGBA
 * buffer (page-renderer style, supersampled for smooth edges) and encodes a PNG.
 */

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** s: { x, y, w, h, r, rot (deg), color } in 0..1 unit space */
function insideRoundRect(px, py, s) {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const a = (-s.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = px - cx;
  const dy = py - cy;
  const rx = Math.abs(dx * cos - dy * sin);
  const ry = Math.abs(dx * sin + dy * cos);
  const hw = s.w / 2;
  const hh = s.h / 2;
  if (rx > hw || ry > hh) return false;
  const qx = rx - (hw - s.r);
  const qy = ry - (hh - s.r);
  if (qx <= 0 || qy <= 0) return true;
  return qx * qx + qy * qy <= s.r * s.r;
}

function render(size, shapes, ss = 3) {
  const big = size * ss;
  const acc = new Float32Array(big * big * 4);
  for (let y = 0; y < big; y++) {
    const py = (y + 0.5) / big;
    for (let x = 0; x < big; x++) {
      const px = (x + 0.5) / big;
      let r = 0, g = 0, b = 0, a = 0;
      for (const s of shapes) {
        if (!insideRoundRect(px, py, s)) continue;
        const [cr, cg, cb] = hex(s.color);
        // source-over
        r = cr * s.alpha + r * (1 - s.alpha);
        g = cg * s.alpha + g * (1 - s.alpha);
        b = cb * s.alpha + b * (1 - s.alpha);
        a = s.alpha + a * (1 - s.alpha);
      }
      const i = (y * big + x) * 4;
      acc[i] = r;
      acc[i + 1] = g;
      acc[i + 2] = b;
      acc[i + 3] = a * 255;
    }
  }
  // box downsample
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const k = ((y * ss + j) * big + (x * ss + i)) * 4;
          r += acc[k];
          g += acc[k + 1];
          b += acc[k + 2];
          a += acc[k + 3];
        }
      }
      const n = ss * ss;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

const CREAM = '#faf9f6';
const SAGE = '#7ba487';
const NOTE_YELLOW = '#f7e6ac';
const NOTE_PINK = '#f6d2d9';
const NOTE_GREEN = '#d4e9cf';

/** Three sticky notes, slightly askew — the same language as the boards screen. */
function notesShapes({ bg, scale = 1, cx = 0.5, cy = 0.52 }) {
  const s = [
    { x: -0.26, y: -0.33, w: 0.36, h: 0.34, r: 0.04, rot: -8, color: NOTE_YELLOW, alpha: 1 },
    { x: 0.03, y: -0.11, w: 0.33, h: 0.32, r: 0.04, rot: 6, color: NOTE_PINK, alpha: 1 },
    { x: -0.21, y: 0.03, w: 0.32, h: 0.31, r: 0.04, rot: 3, color: NOTE_GREEN, alpha: 1 },
  ];
  return [
    bg,
    ...s.map((sh) => ({
      ...sh,
      x: cx + sh.x * scale,
      y: cy + sh.y * scale,
      w: sh.w * scale,
      h: sh.h * scale,
      r: sh.r * scale,
    })),
  ];
}

const outDir = new URL('../public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const squareBg = { x: 0, y: 0, w: 1, h: 1, r: 0, rot: 0, color: CREAM, alpha: 1 };
const roundedBg = { x: 0, y: 0, w: 1, h: 1, r: 0.19, rot: 0, color: CREAM, alpha: 1 };
const sageBg = { x: 0, y: 0, w: 1, h: 1, r: 0, rot: 0, color: SAGE, alpha: 1 };

/** keep artwork inside the 80% maskable safe zone */
const safe = { bg: sageBg, scale: 0.86, cx: 0.5, cy: 0.5 };

const jobs = [
  ['icon-192.png', 192, notesShapes({ bg: roundedBg, scale: 1, cx: 0.5, cy: 0.5 })],
  ['icon-512.png', 512, notesShapes({ bg: roundedBg, scale: 1, cx: 0.5, cy: 0.5 })],
  ['maskable-512.png', 512, notesShapes(safe)],
  ['apple-touch-icon.png', 180, notesShapes({ bg: squareBg, scale: 1, cx: 0.5, cy: 0.5 })],
];

for (const [name, size, shapes] of jobs) {
  writeFileSync(new URL(name, outDir), encodePNG(size, size, render(size, shapes)));
  console.log('wrote', name);
}

// favicon: hand-written SVG, no raster needed
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${CREAM}"/>
  <rect x="13" y="12" width="22" height="21" rx="3" fill="${NOTE_YELLOW}" transform="rotate(-8 24 22.5)"/>
  <rect x="31" y="24" width="20" height="19" rx="3" fill="${NOTE_PINK}" transform="rotate(6 41 33.5)"/>
  <rect x="16" y="34" width="19" height="18" rx="3" fill="${NOTE_GREEN}" transform="rotate(3 25.5 43)"/>
</svg>
`;
writeFileSync(new URL('../favicon.svg', outDir), favicon);
console.log('wrote favicon.svg');
