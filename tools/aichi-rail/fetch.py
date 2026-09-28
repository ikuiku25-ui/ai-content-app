"""
国土数値情報の元データを取得して data-raw/ に展開する。

- 鉄道データ（N02）：最新年度から順に探し、最初に見つかった年度を使う
- 行政区域（N03）：愛知県（都道府県コード 23）分のみ。こちらも最新年から探す

取得したファイル名は data-raw/sources.json に記録し、inspect_raw.py と build.py はそれを読む。
年度を固定したいときは引数で指定する：

    python fetch.py                  # 最新を自動で探す
    python fetch.py --n02 24 --n03 2025

サイトに接続できない環境では、手元の zip を渡せる（その分はダウンロードしない）：

    python fetch.py --n02-zip N02-25_GML.zip --n03-zip N03-20250101_23_GML.zip
"""
import argparse
import datetime
import io
import json
import re
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

RAW_DIR = Path(__file__).parent / "data-raw"
BASE = "https://nlftp.mlit.go.jp/ksj/gml/data"
AICHI = "23"


def try_download(url):
    """見つかれば中身（bytes）、無ければ None。404以外の失敗はそのまま例外にする。"""
    try:
        with urllib.request.urlopen(url, timeout=120) as res:
            return res.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def extract_geojson(blob, dest):
    """zip内のGeoJSONだけを取り出す。GMLやShapefileは使わないので展開しない。"""
    names = []
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for info in z.infolist():
            if not info.filename.lower().endswith(".geojson"):
                continue
            # 古い版は文字コード別のフォルダ（UTF-8/ Shift-JIS/）に同じものが入っている
            if "shift" in info.filename.lower():
                continue
            out = dest / Path(info.filename).name
            out.write_bytes(z.read(info))
            names.append(out.name)
    return names


def from_zip(path, dest):
    blob = Path(path).read_bytes()
    # アップロード時に付く先頭の識別子（例：72ccd15e-）は外し、公式のファイル名で記録する
    name = re.sub(r"^[0-9a-f]{8}-", "", Path(path).name)
    return f"file:{name}", extract_geojson(blob, dest)


def fetch_n02(year2):
    candidates = [year2] if year2 else range(datetime.date.today().year % 100, 18, -1)
    for yy in candidates:
        url = f"{BASE}/N02/N02-{yy:02d}/N02-{yy:02d}_GML.zip"
        print(f"N02: {url}")
        blob = try_download(url)
        if blob:
            return url, extract_geojson(blob, RAW_DIR)
    sys.exit("N02 が見つかりませんでした")


def fetch_n03(year4):
    candidates = [year4] if year4 else range(datetime.date.today().year, 2019, -1)
    for yyyy in candidates:
        url = f"{BASE}/N03/N03-{yyyy}/N03-{yyyy}0101_{AICHI}_GML.zip"
        print(f"N03: {url}")
        blob = try_download(url)
        if blob:
            return url, extract_geojson(blob, RAW_DIR)
    sys.exit("N03 が見つかりませんでした")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n02", type=int, help="N02 の年度（西暦下2桁。例：24）")
    ap.add_argument("--n03", type=int, help="N03 の年（西暦4桁。例：2025）")
    ap.add_argument("--n02-zip", help="ダウンロード済みの N02 zip")
    ap.add_argument("--n03-zip", help="ダウンロード済みの N03（愛知県）zip")
    args = ap.parse_args()

    RAW_DIR.mkdir(exist_ok=True)
    n02_url, n02_files = from_zip(args.n02_zip, RAW_DIR) if args.n02_zip else fetch_n02(args.n02)
    n03_url, n03_files = from_zip(args.n03_zip, RAW_DIR) if args.n03_zip else fetch_n03(args.n03)

    sources = {
        "n02": {"url": n02_url, "files": n02_files},
        "n03": {"url": n03_url, "files": n03_files},
        "fetched_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    (RAW_DIR / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(sources, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
