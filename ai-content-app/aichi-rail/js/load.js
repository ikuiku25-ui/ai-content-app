/**
 * 路線データと設定ファイルをまとめて読み込む。2D確認用ページと3D本体で共用する。
 * 設定ファイル（config/）はここで毎回読むので、書き換えたら再読み込みだけで反映される。
 */
const FILES = {
  lines: 'data/lines.json',
  stations: 'data/stations.json',
  boundary: 'data/boundary.json',
  meta: 'data/meta.json',
  colors: 'config/colors.json',
  transfers: 'config/transfer-groups.json',
  major: 'config/major-stations.json',
  layers: 'config/layers.json',
  underground: 'config/underground.json',
};

export async function loadAll(only = Object.keys(FILES)) {
  const entries = await Promise.all(
    only.map(async (key) => {
      // 設定を直した直後に古い内容が出ないよう、ブラウザのキャッシュは確認付きで使う
      const res = await fetch(FILES[key], { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${FILES[key]} を読み込めませんでした（HTTP ${res.status}）`);
      return [key, await res.json()];
    })
  );
  return Object.fromEntries(entries);
}

export const ATTRIBUTION =
  '出典：国土交通省「国土数値情報（鉄道データ・行政区域データ）」を加工して作成';
