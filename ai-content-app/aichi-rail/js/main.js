/**
 * 愛知の鉄道3D路線図（本体）
 *
 * 座標：データの x（東）・y（北）をそのまま m 単位で使い、Three.js では
 *   X = x、Y = 高さ、Z = -y（北が画面奥）
 * に置く。高さ（地下の深さ）は表示用の値で、config/layers.json で変えられる。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { loadAll, ATTRIBUTION } from './load.js';
import { buildLineColors } from './colors.js';
import { buildTransferGroups } from './transfers.js';
import { buildMajorStations } from './major.js';
import { buildHeights } from './heights.js';
import { createLabels } from './labels.js';
import { createUI } from './ui.js';

// 視点プリセット：注視点（x, y は北向き m、h は高さ）と、そこからのカメラの向き・距離
const VIEWS = {
  nagoya: { x: 2500, y: -1500, h: -1000, dist: 17000, polar: 62, azimuth: -18 },
  aichi: { x: 20000, y: -12000, h: 0, dist: 105000, polar: 50, azimuth: 0 },
  underground: { x: 2500, y: -1000, h: -1500, dist: 13000, polar: 115, azimuth: -25 },
};
const LINE_WIDTH_PX = 3;
const TAP_RADIUS_PX = 24;   // タップ位置からこの距離以内の駅を選ぶ
const IDLE_FRAMES = 30;     // 何も動かないフレームがこれだけ続いたら描画ループを止める

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#eef1f5');
const camera = new THREE.PerspectiveCamera(45, 1, 20, 600000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.screenSpacePanning = false; // 移動は地面に沿って
controls.minDistance = 600;
controls.maxDistance = 260000;

// 深さ強調スライダーの倍率は、この親グループの scale.y で掛ける（地面と境界線は含めない）
const world = new THREE.Group();
scene.add(world);
const lineMaterials = [];
const companyObjects = new Map(); // 事業者 → その事業者の路線・駅の3Dオブジェクト
const visible = new Set();        // 表示中の事業者
let model, labels, ui, links, marker;
let needsRender = true;

main().catch((e) => {
  document.getElementById('err').textContent = `読み込めませんでした：${e.message}`;
  throw e;
});

async function main() {
  const d = await loadAll();
  document.getElementById('attr').textContent = ATTRIBUTION;

  const lineColor = buildLineColors(d.lines, d.colors);
  const { groups, groupOf } = buildTransferGroups(d.stations, d.transfers);
  const major = buildMajorStations(d.lines, d.stations, groupOf, d.major);
  const { partsOf, stationHeight } = buildHeights(d.lines, d.stations, d.layers, d.underground);
  const lineById = new Map(d.lines.map((l) => [l.id, l]));
  model = { ...d, lineColor, groups, groupOf, major, stationHeight, lineById };

  for (const company of Object.keys(d.colors.companies)) {
    const g = new THREE.Group();
    companyObjects.set(company, g);
    world.add(g);
    visible.add(company);
  }
  addGround(d.boundary, d.colors.boundary);
  addLines(d.lines, partsOf, lineColor);
  addStations(d.stations, stationHeight, lineColor);
  marker = addMarker();
  labels = createLabels(document.getElementById('labels'), labelItems(d.stations, groups, groupOf, major, stationHeight));

  ui = createUI({
    companies: d.colors.companies,
    lines: d.lines,
    lineColor,
    onViewChange: (name) => setView(name, true),
    onCompanyToggle: (company, on) => {
      on ? visible.add(company) : visible.delete(company);
      applyVisibility();
    },
    onDepthScale: (v) => {
      world.scale.y = v;
      world.updateMatrixWorld();
      requestRender();
    },
    onInfoClose: () => select(null),
  });
  for (const company of ui.hiddenCompanies()) visible.delete(company);
  world.scale.y = ui.depthScale();
  applyVisibility();

  resize();
  setView(new URLSearchParams(location.search).get('view') || 'nagoya', false);

  controls.addEventListener('change', requestRender);
  addEventListener('resize', resize);
  addTapHandler();
  document.getElementById('loading').remove();
  requestRender();
}

// ---- 地面（県の形）と境界線
function addGround(boundary, colors) {
  const shapes = boundary.prefecture.map((ring) => new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y))));
  const geo = new THREE.ShapeGeometry(shapes);
  geo.rotateX(-Math.PI / 2); // (x, y, 0) → (x, 0, -y)
  // 半透明にして、地下の路線が透けて見えるようにする
  const ground = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
  }));
  ground.renderOrder = 1;
  scene.add(ground); // 地面は深さ強調の影響を受けないので world には入れない

  for (const ring of boundary.prefecture) scene.add(makeLine(ring.map(([x, y]) => [x, y, 0]), colors.prefecture, 1.5));
  for (const ring of boundary.nagoya) scene.add(makeLine(ring.map(([x, y]) => [x, y, 2]), colors.nagoya, 1, true));
}

/** points はデータの座標 [x（東）, y（北）, 高さ] の配列 */
function makeLine(points, color, width, dashed = false) {
  const geo = new LineGeometry();
  geo.setPositions(points.flatMap(([x, y, h]) => [x, h, -y]));
  const mat = new LineMaterial({ color, linewidth: width, dashed, dashSize: 300, gapSize: 200 });
  lineMaterials.push(mat);
  const line = new Line2(geo, mat);
  if (dashed) line.computeLineDistances();
  return line;
}

// ---- 路線
function addLines(lines, partsOf, lineColor) {
  for (const line of lines) {
    for (const part of partsOf.get(line.id)) {
      companyObjects.get(line.company).add(makeLine(part, lineColor.get(line.id), LINE_WIDTH_PX));
    }
  }
}

// ---- 駅（画面上で一定の大きさの丸。外側が路線色、内側が白）。事業者ごとに分けて切り替えられるようにする
const disc = discTexture(false);
function addStations(stations, stationHeight, lineColor) {
  for (const [company, group] of companyObjects) {
    const own = stations.filter((s) => s.company === company);
    const pos = new Float32Array(own.length * 3);
    const col = new Float32Array(own.length * 3);
    const c = new THREE.Color();
    own.forEach((s, i) => {
      pos.set([s.x, stationHeight.get(s.id), -s.y], i * 3);
      c.set(lineColor.get(s.lineId));
      col.set([c.r, c.g, c.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const outer = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 10, sizeAttenuation: false, vertexColors: true, map: disc, alphaTest: 0.5,
    }));
    const inner = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 5, sizeAttenuation: false, color: '#ffffff', map: disc, alphaTest: 0.5, depthFunc: THREE.LessEqualDepth,
    }));
    inner.renderOrder = 2;
    group.add(outer, inner);
  }
}

/** 丸（ring=true なら輪）の画像。駅の点と、選んだ駅の目印に使う */
function discTexture(ring) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.beginPath();
  g.arc(32, 32, ring ? 26 : 30, 0, Math.PI * 2);
  if (ring) {
    g.lineWidth = 8;
    g.strokeStyle = '#fff';
    g.stroke();
  } else {
    g.fillStyle = '#fff';
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- 選んだ駅の目印（乗換グループの駅すべてに輪を出す）
function addMarker() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 24, sizeAttenuation: false, color: '#1d2433', map: discTexture(true), transparent: true, depthTest: false,
  }));
  m.renderOrder = 10;
  m.visible = false;
  world.add(m);
  return m;
}

// ---- 乗換：同じグループの駅を、高さの順に縦の点線でつなぐ（表示中の事業者の駅だけ）
function rebuildTransferLinks() {
  if (links) {
    world.remove(links);
    links.geometry.dispose();
  }
  const h = model.stationHeight;
  const pos = [];
  for (const g of model.groups) {
    const ss = g.stations.filter((s) => visible.has(s.company)).sort((a, b) => h.get(a.id) - h.get(b.id));
    for (let i = 1; i < ss.length; i++) {
      const a = ss[i - 1], b = ss[i];
      if (h.get(a.id) === h.get(b.id) && a.x === b.x && a.y === b.y) continue;
      pos.push(a.x, h.get(a.id), -a.y, b.x, h.get(b.id), -b.y);
    }
  }
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos.length ? pos : [0, 0, 0, 0, 0, 0]);
  const mat = links ? links.material : new LineMaterial({ color: '#2b3245', linewidth: 1.6, dashed: true, dashSize: 60, gapSize: 45 });
  if (!links) lineMaterials.push(mat);
  mat.resolution.set(stage.clientWidth, stage.clientHeight);
  links = new LineSegments2(geo, mat);
  links.computeLineDistances();
  links.visible = pos.length > 0;
  world.add(links);
}

function applyVisibility() {
  for (const [company, group] of companyObjects) group.visible = visible.has(company);
  rebuildTransferLinks();
  // 開いている駅の情報も、表示中の事業者だけで作り直す（選んだ駅自体が消えたら閉じる）
  if (selected) select(visible.has(selected.company) ? selected : null);
  requestRender();
}

// ---- ラベルの一覧（乗換グループは1つにまとめる）
function labelItems(stations, groups, groupOf, major, stationHeight) {
  const point = (s) => ({ x: s.x, y: s.y, h: stationHeight.get(s.id), company: s.company });
  const items = [];
  for (const g of groups) {
    items.push({ text: g.name, major: g.stations.some((s) => major.has(s.id)), under: false, points: g.stations.map(point) });
  }
  for (const s of stations) {
    if (groupOf.has(s.id)) continue;
    items.push({ text: s.name, major: major.has(s.id), under: stationHeight.get(s.id) < 0, points: [point(s)] });
  }
  return items;
}
const labelShown = (p) => visible.has(p.company);

// ---- 駅のタップ
let selected = null;
function addTapHandler() {
  const el = renderer.domElement;
  let down = null;
  el.addEventListener('pointerdown', (e) => {
    // 2本目の指が触れたら（ピンチ操作）、タップとはみなさない
    down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    wake();
  });
  el.addEventListener('pointerup', (e) => {
    // 指をほとんど動かさずに離したときだけ「タップ」とみなす（回転・移動の操作と区別する）
    if (!down || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved < 8 && performance.now() - down.t < 500) select(pickStation(e.clientX, e.clientY));
    down = null;
  });
  el.addEventListener('pointercancel', () => (down = null));
  el.addEventListener('wheel', wake, { passive: true });
}

/** 画面上でタップ位置にいちばん近い駅（表示中の事業者のみ） */
function pickStation(px, py) {
  const rect = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector3();
  let best = null, bestD = TAP_RADIUS_PX;
  for (const s of model.stations) {
    if (!visible.has(s.company)) continue;
    v.set(s.x, model.stationHeight.get(s.id), -s.y).applyMatrix4(world.matrixWorld).project(camera);
    if (v.z > 1) continue;
    const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
    const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
    const d = Math.hypot(sx - px, sy - py);
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

function select(station) {
  selected = station;
  if (!station) {
    marker.visible = false;
    ui.hideInfo();
    requestRender();
    return;
  }
  const g = model.groupOf.get(station.id);
  const members = (g ? g.stations : [station]).filter((s) => visible.has(s.company));
  const h = model.stationHeight;
  marker.geometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array(members.flatMap((s) => [s.x, h.get(s.id), -s.y])), 3));
  marker.visible = true;

  // 上から順（高架 → 地上 → 地下の浅い順）に並べる
  const rows = [...members].sort((a, b) => h.get(b.id) - h.get(a.id)).map((s) => {
    const line = model.lineById.get(s.lineId);
    const height = h.get(s.id);
    return {
      station: s.name,
      line: line.line,
      company: model.colors.companies[line.company].label,
      color: model.lineColor.get(line.id),
      level: height < 0 ? '地下' : line.kind === 'shinkansen' ? '高架' : '地上',
    };
  });
  ui.showInfo({ title: g ? g.name : station.name, rows });
  requestRender();
}

// ---- 視点
let tween = null;
function setView(name, animate) {
  const v = VIEWS[name] || VIEWS.nagoya;
  ui.setActiveView(name);
  // 深さを強調しているときは、注視点の高さと距離もそれに合わせる（地下の層の中にカメラが入らないように）
  const k = world.scale.y;
  const target = new THREE.Vector3(v.x, v.h * k, -v.y);
  const polar = THREE.MathUtils.degToRad(v.polar), az = THREE.MathUtils.degToRad(v.azimuth);
  const offset = new THREE.Vector3(
    Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az)
  ).multiplyScalar(v.dist * Math.max(1, 0.75 / camera.aspect) * Math.max(1, 1 + (k - 1) * 0.35)); // 縦長の画面では引いて見る
  const to = { target, position: target.clone().add(offset) };
  if (!animate) {
    controls.target.copy(to.target);
    camera.position.copy(to.position);
    controls.update();
    requestRender();
    return;
  }
  tween = { from: { target: controls.target.clone(), position: camera.position.clone() }, to, start: performance.now() };
  wake();
}

function stepTween(now) {
  const t = Math.min(1, (now - tween.start) / 700);
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  controls.target.lerpVectors(tween.from.target, tween.to.target, e);
  camera.position.lerpVectors(tween.from.position, tween.to.position, e);
  if (t === 1) tween = null;
  needsRender = true;
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  for (const m of lineMaterials) m.resolution.set(w, h);
  requestRender();
}

// ---- 描画ループ。動いていないときは止めて、電池の消耗を抑える
let running = false, idle = 0;
function requestRender() {
  needsRender = true;
  wake();
}
function wake() {
  idle = 0;
  if (!running) {
    running = true;
    renderer.setAnimationLoop(loop);
  }
}
function loop(now) {
  if (tween) stepTween(now);
  controls.update(); // 慣性（ダンピング）の動きもここで進む。動けば change → needsRender
  if (!needsRender) {
    if (++idle > IDLE_FRAMES && !tween) {
      running = false;
      renderer.setAnimationLoop(null);
    }
    return;
  }
  idle = 0;
  needsRender = false;
  renderer.render(scene, camera);
  labels.update(camera, world, stage.clientWidth, stage.clientHeight, labelShown);
}
