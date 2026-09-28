/**
 * 路線・駅の高さを決める（config/layers.json と config/underground.json）。
 *
 * 地下鉄は路線ごとの深さ、地上線は事業者ごとの高さ、新幹線は高架の高さに置く。
 * underground.json に書いた区間は、指定の駅を地下に置き、となりの地上の駅との間を坂でつなぐ。
 * 坂は「駅の位置（線に沿った距離）ごとの高さ」を線形に補間して作る。
 */
const DENSIFY_M = 50;          // 坂のある路線は、この間隔で点を足してから高さを付ける
const STATION_ON_PART_M = 150; // 駅がこの距離以内にある区間を「その駅を通る区間」とみなす

export function baseHeight(line, layers) {
  if (line.kind === 'subway') return layers.subway[line.line] ?? -500;
  if (line.kind === 'shinkansen') return layers.shinkansen;
  return layers.ground[line.company] ?? 0;
}

/**
 * 戻り値：
 *   parts: 区間ごとの [x, y, h] の配列
 *   stationHeight: 駅id → 高さ
 */
export function buildHeights(lines, stations, layers, underground) {
  const stationsOf = new Map();
  for (const s of stations) {
    if (!stationsOf.has(s.lineId)) stationsOf.set(s.lineId, []);
    stationsOf.get(s.lineId).push(s);
  }
  const partsOf = new Map();
  const stationHeight = new Map();

  for (const line of lines) {
    const base = baseHeight(line, layers);
    const own = stationsOf.get(line.id) || [];
    const section = underground.sections.find((u) => u.company === line.company && u.line === line.line);
    const deep = new Set(section ? section.stations : []);

    for (const s of own) stationHeight.set(s.id, deep.has(s.name) ? section.depth : base);

    if (!section) {
      partsOf.set(line.id, line.parts.map((p) => p.map(([x, y]) => [x, y, base])));
      continue;
    }
    partsOf.set(line.id, line.parts.map((part) => {
      const pts = densify(part, DENSIFY_M);
      const arc = cumulative(pts);
      // この区間を通る駅の、線に沿った位置と高さ
      const keys = own
        .map((s) => ({ ...project(pts, arc, s), h: stationHeight.get(s.id) }))
        .filter((k) => k.d <= STATION_ON_PART_M)
        .sort((a, b) => a.t - b.t);
      if (!keys.some((k) => k.h !== base)) return pts.map(([x, y]) => [x, y, base]);
      return pts.map(([x, y], i) => [x, y, interpolate(keys, arc[i])]);
    }));
  }
  return { partsOf, stationHeight };
}

function densify(part, step) {
  const out = [part[0]];
  for (let i = 1; i < part.length; i++) {
    const [ax, ay] = part[i - 1], [bx, by] = part[i];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

function cumulative(pts) {
  const arc = [0];
  for (let i = 1; i < pts.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return arc;
}

/** 駅を線上に投影し、線に沿った位置 t と線からの距離 d を返す */
function project(pts, arc, s) {
  let best = { t: 0, d: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.y - ay) * dy) / len2));
    const d = Math.hypot(ax + u * dx - s.x, ay + u * dy - s.y);
    if (d < best.d) best = { t: arc[i - 1] + u * Math.sqrt(len2), d };
  }
  return best;
}

function interpolate(keys, t) {
  if (t <= keys[0].t) return keys[0].h;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      return a.h + ((b.h - a.h) * (t - a.t)) / (b.t - a.t || 1);
    }
  }
  return keys[keys.length - 1].h;
}
