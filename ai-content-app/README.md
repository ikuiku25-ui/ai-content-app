# はじめてのAI学習（PWA）

AI初心者向け学習コンテンツを配信するPWA。現在はフェーズ2まで完了。

公開URL: <https://ikuiku25-ui.github.io/ai-content-app/>

## ローカルで起動する

このフォルダ（`ai-content-app/`）に移動してサーバーを起動する。

```bash
python3 -m http.server 8080
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

キャッシュが返されているため。原因は2つあり、どちらも起きうる。

1. **Service Workerのキャッシュ** — `sw.js` の `SHELL_VERSION` を上げる（`v2` → `v3`）。
   古いキャッシュは自動削除される。コンテンツ側は `CONTENT_VERSION` が別にあるので
   巻き込まれない
2. **ブラウザ自身のキャッシュ** — Chrome DevTools → Network → 「Disable cache」を
   オンにするか、DevToolsを開いた状態で再読み込みボタンを長押し →「キャッシュの消去と
   ハード再読み込み」

## キャッシュの構成

2つに分けている。

| キャッシュ名 | 中身 | いつ保存されるか |
| --- | --- | --- |
| `ai-content-app-shell-v2` | HTML・CSS・JS・アイコン | インストール時に一括 |
| `ai-content-app-content-v1` | `content/` 以下（記事データ・図解） | 記事を開いた時 |

バージョン番号を別々にしているのは、アプリを修正するたびに購入済みコンテンツまで
消えてしまうのを防ぐため。

## コンテンツの追加・編集

記事本文は `content/lesson-01.json` にある。`content.html` に直接書かず、JSONから
読み込んで描画している。フェーズ3で取得先をGASに変えるとき、描画側を書き換えずに
済ませるため。

ブロックの種類は `heading` / `paragraph` / `list` / `figure` / `note`。図解は
`content/figures/` にSVGで置く。

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
| `content.html` | 記事表示ページ |
| `offline.html` | オフライン時に表示する代替画面 |
| `manifest.json` | アプリ名・アイコン・テーマカラーなどPWAの設定 |
| `sw.js` | Service Worker。ルート直下から動かさないこと |
| `assets/js/sw-register.js` | Service Workerの登録（全ページで読み込む） |
| `assets/js/app.js` | トップページのインストール導線 |
| `assets/js/content.js` | 記事の描画 |
| `assets/css/style.css` | スタイル（ダークモード対応） |
| `assets/icons/` | PWAアイコン一式 |
| `content/` | 記事データと図解 |

## 公開

`main` ブランチにpushすると、GitHub Actions（`.github/workflows/deploy.yml`）が
`ai-content-app/` フォルダだけをGitHub Pagesへ公開する。`tools/` や `docs/` は
公開されない。
