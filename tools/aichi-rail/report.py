"""
build.py の出力を確認するための一覧を Markdown で出す。

    python report.py > report.md

- 事業者別・路線別の駅数と路線長
- 乗換グループ（config/transfer-groups.json の設定を反映した最終結果）
- 同名だが離れているため別の駅として扱ったもの
"""
import json
import math
from collections import defaultdict
from itertools import combinations
from pathlib import Path

APP = Path(__file__).parent.parent.parent / "ai-content-app" / "aichi-rail"
DATA = APP / "data"
CONFIG = APP / "config"
COMPANY_LABEL = {"subway": "名古屋市交通局", "jr": "JR東海", "meitetsu": "名古屋鉄道", "kintetsu": "近畿日本鉄道"}


def main():
    lines = json.loads((DATA / "lines.json").read_text(encoding="utf-8"))
    stations = json.loads((DATA / "stations.json").read_text(encoding="utf-8"))
    per_line = defaultdict(int)
    for s in stations:
        per_line[s["lineId"]] += 1

    print("## 事業者別・路線別の駅数\n")
    for company, label in COMPANY_LABEL.items():
        ls = [l for l in lines if l["company"] == company]
        names = {s["name"] for s in stations if s["company"] == company}
        print(f"### {label}（{len(ls)} 路線・駅名 {len(names)}・駅（路線ごと） {sum(per_line[l['id']] for l in ls)}）\n")
        print("| 路線 | 種別 | 駅数 | 県内延長 km | 区間数 |")
        print("|---|---|---:|---:|---:|")
        for l in ls:
            print(f"| {l['line']} | {l['kind']} | {per_line[l['id']]} | {l['length_km']} | {len(l['parts'])} |")
        print()

    groups, split_names = transfer_groups(stations, json.loads((CONFIG / "transfer-groups.json").read_text(encoding="utf-8")))
    print(f"## 乗換グループ（{len(groups)} グループ）\n")
    print("| グループ | 駅（路線） | 路線数 | 最大距離 m | 決め方 |")
    print("|---|---|---:|---:|---|")
    for g in sorted(groups, key=lambda g: (-len(g["stations"]), g["name"])):
        ss = g["stations"]
        d = max(math.dist((a["x"], a["y"]), (b["x"], b["y"])) for a, b in combinations(ss, 2))
        members = "、".join(f"{s['name']}（{s['line']}）" for s in ss)
        print(f"| {g['name']} | {members} | {len(ss)} | {d:.0f} | {g['source']} |")
    print("\n## 同名だが離れているため別の駅として扱ったもの\n")
    for name, clusters in split_names.items():
        desc = " / ".join("、".join(s["line"] for s in c) for c in clusters)
        print(f"- {name}：{desc}")


def cluster_by_distance(stations, max_m):
    """距離 max_m 以内でつながる駅を1つの塊にする（単連結）。"""
    clusters = []
    for s in stations:
        near = [c for c in clusters if any(math.dist((s["x"], s["y"]), (t["x"], t["y"])) <= max_m for t in c)]
        merged = [s] + [t for c in near for t in c]
        clusters = [c for c in clusters if c not in near] + [merged]
    return clusters


def transfer_groups(stations, cfg):
    """
    乗換グループを決める。ブラウザ側（js/transfers.js）と同じ手順にしてある。
    1) 同名駅を距離で塊にする  2) 設定の groups で別名の駅の塊をつなぐ
    """
    by_name = defaultdict(list)
    for s in stations:
        by_name[s["name"]].append(s)
    clusters_of = {}
    split_names = {}
    for name, ss in by_name.items():
        if name in cfg["excludeAuto"]:
            clusters_of[name] = [[s] for s in ss]
        else:
            clusters_of[name] = cluster_by_distance(ss, cfg["autoSameNameMaxM"])
        if len(clusters_of[name]) > 1:
            split_names[name] = clusters_of[name]

    used = set()
    groups = []
    for g in cfg["groups"]:
        names = [n for n in g["stations"] if n in clusters_of]
        if not names:
            continue
        # 基準は最初の駅名の最初の塊。同名の塊が複数ある駅名は、基準に最も近い塊を選ぶ
        base = clusters_of[names[0]][0]
        members = list(base)
        for n in names[1:]:
            c = min(clusters_of[n], key=lambda c: min(math.dist((a["x"], a["y"]), (b["x"], b["y"])) for a in c for b in base))
            members += c
        used.update(id(c) for n in names for c in clusters_of[n] if any(s in members for s in c))
        groups.append({"name": g["name"], "stations": members, "source": "設定"})
    for name, clusters in clusters_of.items():
        for c in clusters:
            if id(c) not in used and len(c) > 1:
                groups.append({"name": name, "stations": c, "source": "同名（自動）"})
    return groups, split_names


if __name__ == "__main__":
    main()
