# はじめてのAI学習（PWA）

AI初心者向け学習コンテンツを配信するPWA。現在はフェーズ1（土台づくり）まで完了。

## ローカルで起動する

このフォルダに移動してサーバーを起動する。

```bash
cd "/Users/ikumihasegawa/My project/ai-content-app" && python3 -m http.server 8080
```

ブラウザで <http://localhost:8080> を開く。停止は `Ctrl + C`。

**ファイルを直接ダブルクリックして開いても動かない。** `file://` ではService Workerが
動作しないため、必ずサーバー経由で開くこと。

## インストールして試す

- **PC (Chrome / Edge)** — 画面内の「アプリとしてインストール」ボタン、または
  アドレスバー右端のインストールアイコンから
- **Android (Chrome)** — 同じくボタン、またはメニューの「アプリをインストール」から
- **iPhone / iPad (Safari)** — 共有ボタン → 「ホーム画面に追加」

### iPhone実機で試すときの注意

Service Workerは `localhost` かHTTPSでしか動かない。同じWi-Fiから
`http://192.168.x.x:8080` で開いてもPWAとしては動作しない。iPhone実機での確認は、
HTTPS環境に公開したあと（フェーズ2以降）に行う。

## 変更が反映されないときは

Service Workerがキャッシュを返しているため。次のどちらかで解消する。

- Chrome DevTools → Application → Service Workers → 「Update on reload」をオンにする
- `sw.js` の `VERSION` を `v2` のように上げる（古いキャッシュは自動削除される）

## アイコンを差し替える

仮アイコンは `tools/generate-icons.mjs` で生成している。本番用の画像ができたら
`assets/icons/` の同名ファイルを差し替えるだけでよい。再生成する場合は
プロジェクトルートで次を実行する。

```bash
node tools/generate-icons.mjs
```

## ファイル構成

| パス | 役割 |
| --- | --- |
| `index.html` | 仮トップページ（準備中） |
| `offline.html` | オフライン時に表示する代替画面 |
| `manifest.json` | アプリ名・アイコン・テーマカラーなどPWAの設定 |
| `sw.js` | Service Worker。ルート直下から動かさないこと |
| `assets/js/app.js` | Service Workerの登録とインストール導線 |
| `assets/css/style.css` | スタイル（ダークモード対応） |
| `assets/icons/` | PWAアイコン一式 |
| `content/` | 将来のコンテンツ置き場（現在は空） |
