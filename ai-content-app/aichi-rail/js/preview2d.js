/**
 * 段階2の確認用：全路線・全駅・県境・名古屋市境を平面に描く。
 * 3D本体と同じデータ・設定・乗換グループの処理を使うので、位置や色の確認にそのまま使える。
 */
import { loadAll, ATTRIBUTION } from './load.js';
import { buildLineColors } from './colors.js';
import { buildTransferGroups } from './transfers.js';
import { buildMajorStations } from './major.js';

const VIEWS = {
  aichi: { x: 20000, y: -12000, span: 120000 },   // 愛知県全体（中心と表示幅 m）
  nagoya: { x: 2500, y: -1500, span: 16000 },     // 名古屋中心部
};
const LABEL_ALL_SCALE = 0.035; // 1m あたりの画素数がこれ以上なら、主要駅以外の駅名も出す

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const view = { x: 0, y: 0, scale: 0.01 }; // 画面中心の座標(m) と 1mあたりの画素数
let model;

main().catch((e) => {
  document.getElementById('err').textContent = e.message;
  throw e;
});

async function main() {
  const d = await loadAll(['lines', 'stations', 'boundary', 'colors', 'transfers', 'major']);
  const { groups, groupOf } = buildTransferGroups(d.stations, d.transfers);
  model = {
    ...d,
    groups,
    groupOf,
    lineColor: buildLineColors(d.lines, d.colors),
    major: buildMajorStations(d.lines, d.stations, groupOf, d.major),
  };
  document.getElementById('attr').textContent = ATTRIBUTION;
  renderLegend();
  // スマホでは地図が隠れないよう、凡例は閉じた状態で始める
  document.getElementById('legend-details').open = innerWidth > 600;
  setView(new URLSearchParams(location.search).get('view') || 'aichi');
  document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  addInteraction();
  addEventListener('resize', draw);
}

function setView(name) {
  const v = VIEWS[name] || VIEWS.aichi;
  view.x = v.x;
  view.y = v.y;
  view.scale = Math.min(innerWidth, innerHeight) / v.span;
  draw();
}

function renderLegend() {
  const body = document.getElementById('legend-body');
  for (const [company, info] of Object.entries(model.colors.companies)) {
    const ls = model.lines.filter((l) => l.company === company);
    const count = model.stations.filter((s) => s.company === company).length;
    body.insertAdjacentHTML('beforeend', `<div class="co">${info.label}（${ls.length}路線・${count}駅）</div>`);
    for (const l of ls) {
      body.insertAdjacentHTML('beforeend',
        `<div><span class="sw" style="background:${model.lineColor.get(l.id)}"></span>${l.line}</div>`);
    }
  }
}

// ---- 描画
const toScreen = (x, y) => [
  (x - view.x) * view.scale + innerWidth / 2,
  -(y - view.y) * view.scale + innerHeight / 2,
];

function pathRings(rings) {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach(([x, y], i) => {
      const [sx, sy] = toScreen(x, y);
      i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    });
    ctx.closePath();
  }
}

function draw() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  // 県境と名古屋市境
  const bc = model.colors.boundary;
  pathRings(model.boundary.prefecture);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = bc.prefecture;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();
  pathRings(model.boundary.nagoya);
  ctx.strokeStyle = bc.nagoya;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 路線（地上線 → 地下鉄 → 新幹線 の順に重ねる）
  const order = { ground: 0, subway: 1, shinkansen: 2 };
  const lineWidth = Math.max(2, Math.min(5, view.scale * 120));
  for (const line of [...model.lines].sort((a, b) => order[a.kind] - order[b.kind])) {
    ctx.strokeStyle = model.lineColor.get(line.id);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const part of line.parts) {
      ctx.beginPath();
      part.forEach(([x, y], i) => {
        const [sx, sy] = toScreen(x, y);
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.stroke();
    }
  }

  // 駅
  const r = Math.max(2, Math.min(5, view.scale * 150));
  for (const s of model.stations) {
    const [sx, sy] = toScreen(s.x, s.y);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = model.lineColor.get(s.lineId);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // 乗換グループは駅どうしを線で結び、輪で囲む
  ctx.strokeStyle = '#1d2433';
  for (const g of model.groups) {
    ctx.lineWidth = 1;
    for (const s of g.stations) {
      ctx.beginPath();
      ctx.moveTo(...toScreen(g.x, g.y));
      ctx.lineTo(...toScreen(s.x, s.y));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(...toScreen(g.x, g.y), r + 2, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawLabels();
}

/** 駅名。同じ場所に何度も書かないよう、グループは1回だけ。重なるラベルは間引く。 */
function drawLabels() {
  const showAll = view.scale >= LABEL_ALL_SCALE;
  const items = [];
  const seen = new Set();
  for (const s of model.stations) {
    const isMajor = model.major.has(s.id);
    if (!isMajor && !showAll) continue;
    const g = model.groupOf.get(s.id);
    const key = g ? `g:${g.name}` : `s:${s.name}:${s.x}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ text: g ? g.name : s.name, x: g ? g.x : s.x, y: g ? g.y : s.y, major: isMajor });
  }
  items.sort((a, b) => b.major - a.major); // 主要駅を優先して置く
  const placed = [];
  ctx.textBaseline = 'middle';
  for (const it of items) {
    ctx.font = `${it.major ? 600 : 400} ${it.major ? 12 : 11}px -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    const [sx, sy] = toScreen(it.x, it.y);
    if (sx < -50 || sy < -20 || sx > innerWidth + 50 || sy > innerHeight + 20) continue;
    const w = ctx.measureText(it.text).width;
    const box = { x: sx + 7, y: sy - 8, w, h: 16 };
    if (placed.some((p) => box.x < p.x + p.w && p.x < box.x + box.w && box.y < p.y + p.h && p.y < box.y + box.h)) continue;
    placed.push(box);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.strokeText(it.text, box.x, sy);
    ctx.fillStyle = '#1d2433';
    ctx.fillText(it.text, box.x, sy);
  }
}

// ---- 操作（ドラッグで移動、ホイール・ピンチで拡大）
function addInteraction() {
  const pointers = new Map();
  let last = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    last = snapshot();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const now = snapshot();
    if (last && now.n === last.n) {
      if (now.n === 2) zoomAt(now.cx, now.cy, now.d / last.d);
      view.x -= (now.cx - last.cx) / view.scale;
      view.y += (now.cy - last.cy) / view.scale;
      draw();
    }
    last = now;
  });
  const up = (e) => { pointers.delete(e.pointerId); last = snapshot(); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.002));
    draw();
  }, { passive: false });

  function snapshot() {
    const ps = [...pointers.values()];
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length;
    const cy = ps.reduce((s, p) => s + p[1], 0) / ps.length;
    const d = ps.length === 2 ? Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]) : 1;
    return { n: ps.length, cx, cy, d };
  }
}

function zoomAt(sx, sy, factor) {
  // 指（カーソル）の下の地点が動かないように拡大する
  const mx = view.x + (sx - innerWidth / 2) / view.scale;
  const my = view.y - (sy - innerHeight / 2) / view.scale;
  view.scale = Math.min(0.5, Math.max(0.002, view.scale * factor));
  view.x = mx - (sx - innerWidth / 2) / view.scale;
  view.y = my + (sy - innerHeight / 2) / view.scale;
}
