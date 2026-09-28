/**
 * 乗換グループを決める。tools/aichi-rail/report.py の transfer_groups と同じ手順。
 *   1) 同名駅を、距離 autoSameNameMaxM 以内でつながる塊にする
 *   2) 設定の groups に書いた駅名どうしの塊を1つのグループにする
 * 戻り値：groups（2駅以上のもの）と、駅id → グループ の対応
 */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function clusterByDistance(stations, maxM) {
  let clusters = [];
  for (const s of stations) {
    const near = clusters.filter((c) => c.some((t) => dist(s, t) <= maxM));
    clusters = clusters.filter((c) => !near.includes(c)).concat([[s, ...near.flat()]]);
  }
  return clusters;
}

export function buildTransferGroups(stations, cfg) {
  const byName = new Map();
  for (const s of stations) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  const clustersOf = new Map();
  for (const [name, ss] of byName) {
    clustersOf.set(
      name,
      cfg.excludeAuto.includes(name) ? ss.map((s) => [s]) : clusterByDistance(ss, cfg.autoSameNameMaxM)
    );
  }

  const used = new Set();
  const groups = [];
  for (const g of cfg.groups) {
    const names = g.stations.filter((n) => clustersOf.has(n));
    if (!names.length) continue;
    // 基準は最初の駅名の最初の塊。同名の塊が複数ある駅名は、基準に最も近い塊を選ぶ
    const base = clustersOf.get(names[0])[0];
    const members = [...base];
    used.add(base);
    for (const n of names.slice(1)) {
      const nearest = (c) => Math.min(...c.flatMap((a) => base.map((b) => dist(a, b))));
      const c = clustersOf.get(n).reduce((best, c) => (nearest(c) < nearest(best) ? c : best));
      members.push(...c);
      used.add(c);
    }
    groups.push({ name: g.name, stations: members, source: 'config' });
  }
  for (const [name, clusters] of clustersOf) {
    for (const c of clusters) {
      if (!used.has(c) && c.length > 1) groups.push({ name, stations: c, source: 'auto' });
    }
  }

  const groupOf = new Map();
  for (const g of groups) {
    g.x = g.stations.reduce((sum, s) => sum + s.x, 0) / g.stations.length;
    g.y = g.stations.reduce((sum, s) => sum + s.y, 0) / g.stations.length;
    for (const s of g.stations) groupOf.set(s.id, g);
  }
  return { groups, groupOf };
}
