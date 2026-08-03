/**
 * 環境ごとの設定。
 *
 * GAS_ENDPOINT には、Apps Scriptを「ウェブアプリ」としてデプロイしたときに
 * 発行されるURL（https://script.google.com/macros/s/.../exec）を入れる。
 *
 * このURLは公開リポジトリに含まれ、誰でも見られる。それで問題ない。
 * URLは秘密ではなく、鍵はあくまで購入者に渡すコードだからである。
 * 有効なコードがなければ、URLを知っていても本文は返らない。
 */
window.AppConfig = {
  GAS_ENDPOINT:
    'https://script.google.com/macros/s/AKfycbxhm6Fy6JT-jD4rL4ZdfsasjWZbpqLOqkSwWPkfQ-lvCUGLdzlSz0boY1KZQuzVSX0/exec',

  // Googleの設定なしで画面だけ確認したいときは、上を次に差し替える。
  // 確認用サーバーは node tools/mock-gas-server.mjs で起動する。
  //   GAS_ENDPOINT: 'http://localhost:8787/exec',

  // 1コードあたりの上限台数（画面の案内文に使うだけ。実際の判定はGAS側）
  DEVICE_LIMIT_HINT: 3,
};
