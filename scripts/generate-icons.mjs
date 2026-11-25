import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.resolve('apps/pulsebay/apps/desktop/src-tauri/icons');
fs.mkdirSync(outDir, { recursive: true });

// CRC32 table for valid PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function roundedRectSdf(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function renderIconRgba(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 64;

  const wavePoints = [
    [13, 34],
    [22, 34],
    [26.5, 21],
    [33, 43],
    [38.5, 28],
    [42.5, 34],
    [51, 34],
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const ux = (x + 0.5) / scale;
      const uy = (y + 0.5) / scale;

      const outer = roundedRectSdf(ux, uy, 32, 32, 28, 28, 16);
      const inner = roundedRectSdf(ux, uy, 32, 32, 24.5, 24.5, 12.5);
      const panel = roundedRectSdf(ux, uy, 32, 32, 21.5, 21.5, 10.5);

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (outer <= 0.6) {
        const cov = Math.max(0, Math.min(1, 0.6 - outer));
        // Navy border
        r = 22;
        g = 38;
        b = 59;
        a = Math.round(cov * 255);

        if (inner <= 0) {
          // Deep cobalt rim
          r = 27;
          g = 108;
          b = 229;
          a = 255;
        }
        if (panel <= 0) {
          // Bright cobalt inner face
          r = 42;
          g = 123;
          b = 242;
          a = 255;
        }

        // White pulse waveform
        let minWaveDist = 999;
        for (let i = 0; i < wavePoints.length - 1; i += 1) {
          const [x1, y1] = wavePoints[i];
          const [x2, y2] = wavePoints[i + 1];
          minWaveDist = Math.min(minWaveDist, distToSegment(ux, uy, x1, y1, x2, y2));
        }
        if (minWaveDist <= 2.55) {
          const blend = Math.max(0, Math.min(1, (2.55 - minWaveDist) * 1.4));
          r = Math.round(r * (1 - blend) + 255 * blend);
          g = Math.round(g * (1 - blend) + 255 * blend);
          b = Math.round(b * (1 - blend) + 255 * blend);
        }

        // Teal status beacon dot (top right)
        const dotDist = Math.hypot(ux - 48.5, uy - 16.5);
        if (dotDist <= 5.6) {
          if (dotDist <= 3.9) {
            r = 24;
            g = 209;
            b = 182;
          } else {
            r = 22;
            g = 38;
            b = 59;
          }
        }
      }

      const idx = (y * size + x) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  }

  return pixels;
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawRows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rawRows[y * (size * 4 + 1)] = 0; // filter None
    rgba.copy(rawRows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(rawRows, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildIco(pngBuffersWithSizes) {
  const count = pngBuffersWithSizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;
  for (const { size, png } of pngBuffersWithSizes) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffersWithSizes.map((x) => x.png)]);
}

const p32 = encodePng(32, renderIconRgba(32));
const p48 = encodePng(48, renderIconRgba(48));
const p128 = encodePng(128, renderIconRgba(128));
const p256 = encodePng(256, renderIconRgba(256));

fs.writeFileSync(path.join(outDir, '32x32.png'), p32);
fs.writeFileSync(path.join(outDir, '128x128.png'), p128);
fs.writeFileSync(path.join(outDir, '128x128@2x.png'), p256);
fs.writeFileSync(path.join(outDir, 'icon.png'), p256);
fs.writeFileSync(
  path.join(outDir, 'icon.ico'),
  buildIco([
    { size: 32, png: p32 },
    { size: 48, png: p48 },
    { size: 128, png: p128 },
    { size: 256, png: p256 },
  ])
);

console.log('Generated PulseBay desktop PNG + multi-size ICO icons in', outDir);
