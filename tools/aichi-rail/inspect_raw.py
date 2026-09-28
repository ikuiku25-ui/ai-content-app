"""
元データの属性を一覧する。extract.json に書く属性名・値は、この出力を見て決める（推測しない）。

    python inspect_raw.py

出力内容：
- 各GeoJSONの属性名と、値の例・種類数
- 「名古屋市交通局」など対象事業者名を含む属性と、その出現数
"""
import json
from collections import Counter
from pathlib import Path

RAW_DIR = Path(__file__).parent / "data-raw"
TARGET_WORDS = ["名古屋市交通局", "東海旅客鉄道", "名古屋鉄道", "近畿日本鉄道", "名古屋市", "愛知県"]


def load(name):
    return json.loads((RAW_DIR / name).read_text(encoding="utf-8"))


def describe(name):
    data = load(name)
    feats = data["features"]
    print(f"\n=== {name}  （{len(feats)} 件）")
    print("ジオメトリ種別:", dict(Counter(f["geometry"]["type"] for f in feats if f["geometry"])))
    keys = []
    for f in feats:
        for k in f["properties"]:
            if k not in keys:
                keys.append(k)
    for k in keys:
        values = Counter(str(f["properties"].get(k)) for f in feats)
        sample = ", ".join(v for v, _ in values.most_common(4))
        print(f"  {k:<12} 種類数={len(values):<6} 例: {sample}")
    for k in keys:
        values = Counter(str(f["properties"].get(k)) for f in feats)
        hits = {v: n for v, n in values.items() if any(w in v for w in TARGET_WORDS)}
        if hits:
            print(f"  -> {k} に対象の語を含む値: {dict(sorted(hits.items(), key=lambda x: -x[1])[:12])}")


def main():
    sources = json.loads((RAW_DIR / "sources.json").read_text(encoding="utf-8"))
    for group in ("n02", "n03"):
        print(f"\n##### {group}: {sources[group]['url']}")
        for name in sources[group]["files"]:
            describe(name)


if __name__ == "__main__":
    main()
