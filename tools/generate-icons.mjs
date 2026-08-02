/**
 * PWA用の仮アイコンを生成する。
 *
 * 外部ライブラリを使わず、Node標準のzlibだけでPNGを書き出す。
 * 本番用のアイコン画像が用意できたら、このスクリプトごと差し替えてよい。
 *
 *   node tools/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ai-content-app', 'assets', 'icons');

const BG = [0x4f, 0x46, 0xe5]; // テーマカラー（インディゴ）
const FG = [0xff, 0xff, 0xff];

// ---- PNGの書き出し ------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** RGBのピクセル列（w*h*3バイト）をPNGバイナリにする */
function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // カラータイプ: トゥルーカラー(RGB)
  // 10〜12は圧縮方式・フィルタ方式・インターレースで、いずれも0が唯一の規定値

  // 各行の先頭にフィルタ種別バイト(0 = フィルタなし)を付ける
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 図柄 ---------------------------------------------------------------

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * 中央のノードと3つの外側ノードを線でつないだマーク。
 * u, v は中心を原点とした -0.5〜0.5 の座標。reach は図柄の広がり。
 */
function isInsideGlyph(u, v, reach) {
  const outer = [-90, 30, 150].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return [Math.cos(rad) * reach, Math.sin(rad) * reach];
  });

  const lineHalfWidth = 0.05 * reach;
  for (const [x, y] of outer) {
    if (distanceToSegment(u, v, 0, 0, x, y) <= lineHalfWidth) return true;
  }

  if (Math.hypot(u, v) <= 0.24 * reach) return true;
  for (const [x, y] of outer) {
    if (Math.hypot(u - x, v - y) <= 0.19 * reach) return true;
  }
  return false;
}

/** 4x4のスーパーサンプリングで輪郭を滑らかにする */
function renderIcon(size, reach) {
  const samples = 4;
  const rgb = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size - 0.5;
          const v = (y + (sy + 0.5) / samples) / size - 0.5;
          if (isInsideGlyph(u, v, reach)) hits++;
        }
      }
      const coverage = hits / (samples * samples);
      const offset = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) {
        rgb[offset + c] = Math.round(BG[c] + (FG[c] - BG[c]) * coverage);
      }
    }
  }
  return encodePng(size, size, rgb);
}

// ---- 出力 ---------------------------------------------------------------

// maskable用は図柄を小さくする。Androidが円形や角丸に切り抜いても
// 図柄が欠けないよう、中央80%のセーフゾーンに収めるため。
const ICONS = [
  { file: 'icon-192.png', size: 192, reach: 0.34 },
  { file: 'icon-512.png', size: 512, reach: 0.34 },
  { file: 'icon-maskable-512.png', size: 512, reach: 0.26 },
  { file: 'apple-touch-icon-180.png', size: 180, reach: 0.34 },
  { file: 'favicon-32.png', size: 32, reach: 0.34 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, reach } of ICONS) {
  writeFileSync(join(OUT_DIR, file), renderIcon(size, reach));
  console.log(`generated ${file} (${size}x${size})`);
}
