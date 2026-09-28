"""
build.py の出力を確認するための一覧を Markdown で出す。

    python report.py > report.md

- 事業者別・路線別の駅数と路線長
- 同じ駅名が複数の路線にある駅（乗換グループの候補）と、その間の最大距離
"""
import json
import math
from collections import defaultdict
from itertools import combinations
from pathlib import Path

DATA = Path(__file__).parent.parent.parent / "ai-content-app" / "aichi-rail" / "data"
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

    by_name = defaultdict(list)
    for s in stations:
        by_name[s["name"]].append(s)
    print("## 同名駅（乗換グループの候補）\n")
    print("| 駅名 | 路線 | 最大距離 m |")
    print("|---|---|---:|")
    for name, ss in sorted(by_name.items(), key=lambda kv: -len(kv[1])):
        if len(ss) < 2:
            continue
        d = max((math.dist((a["x"], a["y"]), (b["x"], b["y"])) for a, b in combinations(ss, 2)), default=0)
        print(f"| {name} | {'、'.join(s['line'] for s in ss)} | {d:.0f} |")


if __name__ == "__main__":
    main()
