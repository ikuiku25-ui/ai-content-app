/**
 * 駅名ラベルを常に表示する「主要駅」を決める（config/major-stations.json）。
 * 戻り値は駅idの Set。
 */
const END_TOLERANCE_M = 50;    // 線の端どうしがこれ以内なら「つながっている」とみなす
const TERMINUS_MAX_M = 1500;   // 線の端からこれ以内にある最寄り駅を終点とする

export function buildMajorStations(lines, stations, groupOf, cfg) {
  const major = new Set();
  if (cfg.transferGroups) for (const s of stations) if (groupOf.has(s.id)) major.add(s.id);

  if (cfg.termini) {
    for (const line of lines) {
      const own = stations.filter((s) => s.lineId === line.id);
      for (const end of openEnds(line.parts)) {
        let best = null, bestD = TERMINUS_MAX_M;
        for (const s of own) {
          const d = Math.hypot(s.x - end[0], s.y - end[1]);
          if (d < bestD) { best = s; bestD = d; }
        }
        if (best) major.add(best.id);
      }
    }
  }

  const add = new Set(cfg.add), remove = new Set(cfg.remove);
  for (const s of stations) {
    if (add.has(s.name)) major.add(s.id);
    if (remove.has(s.name)) major.delete(s.id);
  }
  return major;
}

/**
 * 路線の「行き止まりの端」を返す。複線が別々の線になっている区間や分岐点では、
 * 端が他の線の端と重なるので、どこともつながっていない端だけを残す。
 */
function openEnds(parts) {
  const ends = parts.flatMap((p) => [p[0], p[p.length - 1]]);
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < END_TOLERANCE_M;
  const touchesMiddle = (e) =>
    parts.some((p) => p.slice(1, -1).some((v) => near(v, e)));
  return ends.filter((e) => ends.filter((f) => near(e, f)).length === 1 && !touchesMiddle(e));
}
