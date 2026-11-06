// สร้างไอคอน PNG (สี่เหลี่ยมมุมมน + รูประฆัง) โดยไม่ใช้ package
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size, maskable) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const S = 4; // supersampling
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
        // พื้นหลังมุมมน
        const r = maskable ? 0 : 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
        if (dx * dx + dy * dy <= r * r) bg++;
        // ระฆัง (ย่อขนาดสำหรับ maskable)
        const k = maskable ? 0.72 : 0.9, X = (u - 0.5) / k + 0.5, Y = (v - 0.5) / k + 0.5;
        const dome = ((X - 0.5) ** 2) / 0.04 + ((Y - 0.42) ** 2) / 0.045 <= 1 && Y <= 0.42;
        const bodyW = 0.2 + (Y - 0.42) * 0.55;
        const body = Y > 0.42 && Y <= 0.66 && Math.abs(X - 0.5) <= bodyW;
        const rim = Y > 0.66 && Y <= 0.71 && Math.abs(X - 0.5) <= 0.3;
        const clap = (X - 0.5) ** 2 + (Y - 0.75) ** 2 <= 0.06 ** 2;
        const knob = (X - 0.5) ** 2 + (Y - 0.205) ** 2 <= 0.035 ** 2;
        if (dome || body || rim || clap || knob) fg++;
      }
      const a = bg / (S * S), f = fg / (S * S), i = y * (size * 4 + 1) + 1 + x * 4;
      const R = 30 + (255 - 30) * f, G = 102 + (255 - 102) * f, B = 210 + (255 - 210) * f;
      raw[i] = R; raw[i + 1] = G; raw[i + 2] = B; raw[i + 3] = Math.round(255 * Math.max(a, f * a));
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync('public/icon-192.png', png(192, false));
writeFileSync('public/icon-512.png', png(512, false));
writeFileSync('public/icon-maskable-512.png', png(512, true));
writeFileSync('public/apple-touch-icon.png', png(180, true));
