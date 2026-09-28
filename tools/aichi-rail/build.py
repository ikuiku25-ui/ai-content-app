"""
元データ（data-raw/）から、表示用の軽量JSONを作る。

    python build.py

処理：
1. N02 から対象4事業者の路線・駅を取り出す（属性名・値は extract.json）
2. N03 の愛知県ポリゴンで切り取る。県外の駅は捨て、県境をまたぐ路線は県境までにする
3. 名古屋駅付近を原点にしたメートル座標へ変換し、形を簡略化する
4. ai-content-app/aichi-rail/data/ に lines.json・stations.json・boundary.json・meta.json を書く

深さ・色・乗換グループなどの表示設定はここでは扱わない（ブラウザ側で config/ を読む）。
"""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

from shapely.geometry import LineString, MultiLineString, Point, shape
from shapely.ops import linemerge, transform, unary_union

HERE = Path(__file__).parent
RAW_DIR = HERE / "data-raw"
OUT_DIR = HERE.parent.parent / "ai-content-app" / "aichi-rail" / "data"
EARTH_R = 6378137.0


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def require_filled(cfg, path=""):
    """extract.json に null が残っていたら止める（推測で埋めないため）。"""
    missing = []
    for k, v in cfg.items():
        if k.startswith("_"):
            continue
        p = f"{path}.{k}" if path else k
        if v is None:
            missing.append(p)
        elif isinstance(v, dict):
            missing += require_filled(v, p)
    return missing


def make_projector(lon0, lat0):
    kx = math.radians(1) * EARTH_R * math.cos(math.radians(lat0))
    ky = math.radians(1) * EARTH_R

    def proj(x, y, z=None):
        # shapely.ops.transform は配列ごと渡してくる
        return (x - lon0) * kx, (y - lat0) * ky

    return proj


def round_coords(line):
    return [[round(x), round(y)] for x, y in line.coords]


def as_lines(geom):
    """切り取り結果から線だけを取り出す（点になった切れ端は捨てる）。"""
    if geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return list(geom.geoms)
    return [part for sub in getattr(geom, "geoms", []) for part in as_lines(sub)]


def drop_spurs(lines_out, stations_out, rule):
    """
    指定した路線から、駅のない短い区間を除く（車両基地への引込線など）。
    除いた区間は標準出力に書き出して確認できるようにする。
    """
    for line in lines_out:
        if line["line"] not in rule["lines"]:
            continue
        own = [Point(s["x"], s["y"]) for s in stations_out if s["lineId"] == line["id"]]
        kept = []
        for part in line["parts"]:
            geom = LineString(part)
            has_station = any(geom.distance(p) <= rule["station_distance_m"] for p in own)
            if geom.length <= rule["max_length_m"] and not has_station:
                print(f"除外: {line['line']} の駅のない区間 {geom.length:.0f}m（端点 {part[0]} → {part[-1]}）")
                continue
            kept.append(part)
        line["parts"] = kept
        line["length_km"] = round(sum(LineString(p).length for p in kept) / 1000, 1)


def polygon_rings(geom, simplify_m, min_area_m2):
    rings = []
    polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    for poly in polys:
        if poly.area < min_area_m2:
            continue
        poly = poly.simplify(simplify_m, preserve_topology=True)
        rings.append(round_coords(poly.exterior))
    return rings


def main():
    cfg = load_json(HERE / "extract.json")
    missing = require_filled(cfg)
    if missing:
        sys.exit("extract.json が未確定です（inspect_raw.py の結果を見て埋める）: " + ", ".join(missing))

    sources = load_json(RAW_DIR / "sources.json")
    n02, n03 = cfg["n02"], cfg["n03"]
    proj = make_projector(cfg["origin"]["lon"], cfg["origin"]["lat"])
    to_m = lambda g: transform(proj, g)
    company_of = {v: k for k, v in n02["operators"].items()}
    # 名城線が「2号線名城線」「4号線名城線」に分かれているなど、表示上は1本にしたい路線をまとめる
    rename = lambda raw: n02["line_rename"].get(raw, raw)

    # --- 愛知県ポリゴンと名古屋市ポリゴン
    admin = load_json(RAW_DIR / n03["file"])["features"]
    pref_shapes, nagoya_shapes = [], []
    for f in admin:
        if not f["geometry"]:
            continue
        g = to_m(shape(f["geometry"])).buffer(0)
        pref_shapes.append(g)
        if f["properties"].get(n03["city_field"]) == n03["nagoya_value"]:
            nagoya_shapes.append(g)
    aichi = unary_union(pref_shapes)
    nagoya = unary_union(nagoya_shapes)
    if nagoya.is_empty:
        sys.exit("名古屋市のポリゴンが見つかりません（n03.city_field / nagoya_value を確認）")

    # --- 路線
    sections = load_json(RAW_DIR / n02["section_file"])["features"]
    by_line = defaultdict(list)
    for f in sections:
        p = f["properties"]
        company = company_of.get(p.get(n02["operator_field"]))
        if not company:
            continue
        key = (company, p[n02["operator_field"]], rename(p[n02["line_field"]]))
        by_line[key].append(to_m(shape(f["geometry"])))

    lines_out = []
    for (company, operator, line), geoms in sorted(by_line.items()):
        clipped = unary_union(geoms).intersection(aichi)
        parts = as_lines(linemerge(as_lines(clipped))) if not clipped.is_empty else []
        parts = [p.simplify(cfg["simplify_m"]["line"]) for p in parts if p.length > 1]
        if not parts:
            continue  # 県内を走らない路線
        kind = "subway" if company == "subway" else ("shinkansen" if line in n02["shinkansen_lines"] else "ground")
        lines_out.append({
            "id": f"{company}:{line}",
            "company": company,
            "operator": operator,
            "line": line,
            "kind": kind,
            "length_km": round(sum(p.length for p in parts) / 1000, 1),
            "parts": [round_coords(p) for p in parts],
        })
    line_ids = {(l["company"], l["line"]) for l in lines_out}

    # --- 駅（N02 の駅は「ホームの線」なので、その中点を駅の位置にする）
    stations_raw = load_json(RAW_DIR / n02["station_file"])["features"]
    station_area = aichi.buffer(cfg["station_clip_buffer_m"])
    stations_out, dropped_outside = [], 0
    for f in stations_raw:
        p = f["properties"]
        company = company_of.get(p.get(n02["operator_field"]))
        if not company:
            continue
        g = to_m(shape(f["geometry"]))
        pt = g.interpolate(0.5, normalized=True) if g.geom_type == "LineString" else g.representative_point()
        if not station_area.contains(pt):
            dropped_outside += 1
            continue
        line = rename(p[n02["line_field"]])
        if (company, line) not in line_ids:
            continue
        stations_out.append({
            "id": f"{company}:{line}:{p[n02['station_name_field']]}",
            "name": p[n02["station_name_field"]],
            "company": company,
            "line": line,
            "lineId": f"{company}:{line}",
            "group": p.get(n02["station_group_field"]),
            "x": round(pt.x),
            "y": round(pt.y),
        })
    # 同じ路線・同じ駅名が複数（ホームの線が分かれている等）の場合は、位置を平均して1つにまとめる。
    # 1km 以上離れていたら別の駅とみなし、id に番号を付けて残す。
    merged = defaultdict(list)
    for s in stations_out:
        for cluster in merged[s["id"]]:
            if math.dist((cluster[0]["x"], cluster[0]["y"]), (s["x"], s["y"])) < 1000:
                cluster.append(s)
                break
        else:
            merged[s["id"]].append([s])
    stations_out = []
    for sid, clusters in merged.items():
        for i, cluster in enumerate(clusters):
            s = dict(cluster[0])
            s["x"] = round(sum(c["x"] for c in cluster) / len(cluster))
            s["y"] = round(sum(c["y"] for c in cluster) / len(cluster))
            if i:
                s["id"] = f"{sid}#{i + 1}"
            stations_out.append(s)

    drop_spurs(lines_out, stations_out, n02["drop_spurs"])

    # --- 境界
    min_area = cfg["min_island_km2"] * 1e6
    boundary = {
        "prefecture": polygon_rings(aichi, cfg["simplify_m"]["prefecture"], min_area),
        "nagoya": polygon_rings(nagoya, cfg["simplify_m"]["nagoya"], min_area),
    }

    meta = {
        "origin": cfg["origin"],
        "sources": {k: sources[k]["url"] for k in ("n02", "n03")},
        "fetched_at": sources["fetched_at"],
        "counts": {"lines": len(lines_out), "stations": len(stations_out), "stations_outside_dropped": dropped_outside},
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dump = lambda name, obj: (OUT_DIR / name).write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    dump("lines.json", lines_out)
    dump("stations.json", stations_out)
    dump("boundary.json", boundary)
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    for name in ("lines.json", "stations.json", "boundary.json"):
        print(f"{name}: {(OUT_DIR / name).stat().st_size / 1024:.0f} KB")
    print(json.dumps(meta["counts"], ensure_ascii=False))

    # 県外の駅が残っていないことの確認（段階1の完了条件）
    outside = [s["id"] for s in stations_out if not station_area.contains(Point(s["x"], s["y"]))]
    if outside:
        sys.exit(f"県外の駅が残っています: {outside[:10]}")
    print("OK: 県外の駅は0件")


if __name__ == "__main__":
    main()
