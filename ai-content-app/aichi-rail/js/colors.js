/**
 * 路線色を決める。config/colors.json の lines に書いた路線はその色、
 * それ以外は事業者の基本色を、路線ごとに少しずつ明るさを変えて使う。
 */
export function buildLineColors(lines, cfg) {
  const colors = new Map();
  const byCompany = new Map();
  for (const line of lines) {
    if (cfg.lines[line.line]) {
      colors.set(line.id, cfg.lines[line.line]);
    } else {
      if (!byCompany.has(line.company)) byCompany.set(line.company, []);
      byCompany.get(line.company).push(line);
    }
  }
  for (const [company, ls] of byCompany) {
    const [h, s, l] = hexToHsl(cfg.companies[company].color);
    const range = cfg.lineLightnessRange;
    ls.forEach((line, i) => {
      // 基本色を中心に、-range〜+range の明るさを路線数で等分して割り当てる
      const offset = ls.length === 1 ? 0 : -range + (2 * range * i) / (ls.length - 1);
      colors.set(line.id, hslToHex(h, s, clamp(l + offset, 0.22, 0.75)));
    });
  }
  return colors;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
