/**
 * 駅名ラベル。HTMLの文字を3D上の駅の位置に重ねて表示する。
 * - 主要駅は常に表示、それ以外はカメラが近いときだけ表示する
 * - 乗換グループは1つのラベルにまとめる（いちばん高い駅の上に出す）
 * - 画面上で重なるラベルは、主要駅を優先して間引く
 */
import * as THREE from 'three';

const NEAR_M = 9000;     // カメラからこの距離以内の駅は、主要駅でなくても名前を出す
const MAX_LABELS = 140;  // 一度に出すラベルの上限（スマホの負荷対策）

export function createLabels(container, items) {
  // items: [{ text, x, y, h, major, under }]
  const els = items.map((it) => {
    const el = document.createElement('div');
    el.className = `label${it.major ? ' major' : ''}${it.under ? ' under' : ''}`;
    el.textContent = it.text;
    el.style.display = 'none';
    container.appendChild(el);
    return el;
  });
  const order = items.map((_, i) => i).sort((a, b) => items[b].major - items[a].major);
  const v = new THREE.Vector3();
  const size = new Map(); // 文字の大きさは一度だけ測る

  /** world: 高さの倍率がかかった親グループ。filter: 表示してよい項目か */
  function update(camera, world, width, height, filter = () => true) {
    const placed = [];
    let shown = 0;
    for (const i of order) {
      const it = items[i], el = els[i];
      let visible = false;
      if (shown < MAX_LABELS && filter(it)) {
        v.set(it.x, it.h, -it.y).applyMatrix4(world.matrixWorld);
        const dist = v.distanceTo(camera.position);
        if (it.major || dist < NEAR_M) {
          v.project(camera);
          if (v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1) {
            if (!size.has(i)) {
              el.style.display = '';
              size.set(i, [el.offsetWidth, el.offsetHeight]);
            }
            const [w, h] = size.get(i);
            const sx = (v.x * 0.5 + 0.5) * width + 6;
            const sy = (-v.y * 0.5 + 0.5) * height - h / 2;
            const box = { x: sx, y: sy, w, h };
            if (!placed.some((p) => box.x < p.x + p.w && p.x < box.x + box.w && box.y < p.y + p.h && p.y < box.y + box.h)) {
              placed.push(box);
              el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
              visible = true;
              shown++;
            }
          }
        }
      }
      el.style.display = visible ? '' : 'none';
    }
  }
  return { update };
}
