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
  // 未設定のうちは、ローカルの確認用サーバーを見る
  GAS_ENDPOINT: 'http://localhost:8787/exec',

  // 1コードあたりの上限台数（画面の案内文に使うだけ。実際の判定はGAS側）
  DEVICE_LIMIT_HINT: 3,
};
