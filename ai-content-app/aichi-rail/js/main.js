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

// 視点プリセット：注視点（x, y は北向き m、h は高さ）と、そこからのカメラの向き・距離
const VIEWS = {
  nagoya: { x: 2500, y: -1500, h: -1000, dist: 17000, polar: 62, azimuth: -18 },
  aichi: { x: 20000, y: -12000, h: 0, dist: 105000, polar: 50, azimuth: 0 },
  underground: { x: 2500, y: -1000, h: -1500, dist: 13000, polar: 115, azimuth: -25 },
};
const LINE_WIDTH_PX = 3;

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
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

// 高さを強調する倍率（段階4のスライダー）は、この親グループの scale.y で掛ける
const world = new THREE.Group();
scene.add(world);
const lineMaterials = [];
let labels, needsRender = true;

main().catch((e) => {
  document.getElementById('err').textContent = e.message;
  throw e;
});

async function main() {
  const d = await loadAll();
  document.getElementById('attr').textContent = ATTRIBUTION;

  const lineColor = buildLineColors(d.lines, d.colors);
  const { groups, groupOf } = buildTransferGroups(d.stations, d.transfers);
  const major = buildMajorStations(d.lines, d.stations, groupOf, d.major);
  const { partsOf, stationHeight } = buildHeights(d.lines, d.stations, d.layers, d.underground);

  addGround(d.boundary, d.colors.boundary);
  addLines(d.lines, partsOf, lineColor);
  addStations(d.stations, stationHeight, lineColor);
  addTransferLinks(groups, stationHeight);
  labels = createLabels(document.getElementById('labels'), labelItems(d.stations, groups, groupOf, major, stationHeight));

  resize();
  const params = new URLSearchParams(location.search);
  setView(params.get('view') || 'nagoya', false);
  document.querySelectorAll('#views button').forEach((b) =>
    b.addEventListener('click', () => setView(b.dataset.view, true)));

  controls.addEventListener('change', () => (needsRender = true));
  addEventListener('resize', resize);
  renderer.setAnimationLoop(loop);
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
  scene.add(ground); // 地面は高さの倍率の影響を受けないので world には入れない

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
      const obj = makeLine(part, lineColor.get(line.id), LINE_WIDTH_PX);
      obj.userData.line = line;
      world.add(obj);
    }
  }
}

// ---- 駅（画面上で一定の大きさの丸。外側が路線色、内側が白）
function addStations(stations, stationHeight, lineColor) {
  const pos = new Float32Array(stations.length * 3);
  const col = new Float32Array(stations.length * 3);
  const c = new THREE.Color();
  stations.forEach((s, i) => {
    pos.set([s.x, stationHeight.get(s.id), -s.y], i * 3);
    c.set(lineColor.get(s.lineId));
    col.set([c.r, c.g, c.b], i * 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const disc = discTexture();
  const outer = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 10, sizeAttenuation: false, vertexColors: true, map: disc, alphaTest: 0.5,
  }));
  const inner = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 5, sizeAttenuation: false, color: '#ffffff', map: disc, alphaTest: 0.5, depthFunc: THREE.LessEqualDepth,
  }));
  inner.renderOrder = 2;
  world.add(outer, inner);
}

function discTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- 乗換：同じグループの駅を、高さの順に縦の点線でつなぐ
function addTransferLinks(groups, stationHeight) {
  const pos = [];
  for (const g of groups) {
    const ss = [...g.stations].sort((a, b) => stationHeight.get(a.id) - stationHeight.get(b.id));
    for (let i = 1; i < ss.length; i++) {
      const a = ss[i - 1], b = ss[i];
      if (stationHeight.get(a.id) === stationHeight.get(b.id) && a.x === b.x && a.y === b.y) continue;
      pos.push(a.x, stationHeight.get(a.id), -a.y, b.x, stationHeight.get(b.id), -b.y);
    }
  }
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos);
  const mat = new LineMaterial({ color: '#2b3245', linewidth: 1.6, dashed: true, dashSize: 60, gapSize: 45 });
  lineMaterials.push(mat);
  const links = new LineSegments2(geo, mat);
  links.computeLineDistances();
  world.add(links);
}

// ---- ラベルの一覧（乗換グループは1つにまとめる）
function labelItems(stations, groups, groupOf, major, stationHeight) {
  const items = [];
  for (const g of groups) {
    const top = g.stations.reduce((a, b) => (stationHeight.get(a.id) >= stationHeight.get(b.id) ? a : b));
    items.push({
      text: g.name, x: top.x, y: top.y, h: stationHeight.get(top.id),
      major: g.stations.some((s) => major.has(s.id)), under: false, stations: g.stations,
    });
  }
  for (const s of stations) {
    if (groupOf.has(s.id)) continue;
    const h = stationHeight.get(s.id);
    items.push({ text: s.name, x: s.x, y: s.y, h, major: major.has(s.id), under: h < 0, stations: [s] });
  }
  return items;
}

// ---- 視点
let tween = null;
function setView(name, animate) {
  const v = VIEWS[name] || VIEWS.nagoya;
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  const target = new THREE.Vector3(v.x, v.h, -v.y);
  const polar = THREE.MathUtils.degToRad(v.polar), az = THREE.MathUtils.degToRad(v.azimuth);
  const offset = new THREE.Vector3(
    Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az)
  ).multiplyScalar(v.dist * Math.max(1, 0.75 / camera.aspect)); // 縦長の画面では左右が狭いので引いて見る
  const to = { target, position: target.clone().add(offset) };
  if (!animate) {
    controls.target.copy(to.target);
    camera.position.copy(to.position);
    controls.update();
    needsRender = true;
    return;
  }
  tween = { from: { target: controls.target.clone(), position: camera.position.clone() }, to, start: performance.now() };
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
  needsRender = true;
}

// 動いていないときは描き直さない（電池の消耗を抑える）
function loop(now) {
  if (tween) stepTween(now);
  controls.update();
  if (!needsRender) return;
  needsRender = false;
  renderer.render(scene, camera);
  labels.update(camera, world, stage.clientWidth, stage.clientHeight);
}
