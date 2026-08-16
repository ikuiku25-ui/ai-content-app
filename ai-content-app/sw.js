/**
 * Service Worker — オフライン対応の土台。
 *
 * このファイルはサイトのルート直下に置くこと。
 * Service Workerは自身が置かれた階層より下しか制御できないため、
 * サブディレクトリに移すとアプリ全体をオフライン化できなくなる。
 */

// キャッシュ名は画面側（premium.js）とも共有するため、定義を1か所にまとめてある。
// 古い番号のキャッシュはactivate時に自動で削除される。
importScripts('assets/js/cache-names.js');

const SHELL_CACHE = self.CacheNames.SHELL;
const CONTENT_CACHE = self.CacheNames.CONTENT;
const CURRENT_CACHES = [SHELL_CACHE, CONTENT_CACHE];

const OFFLINE_URL = './offline.html';

// インストール時にまとめて保存する、画面を出すためのファイル
const SHELL_ASSETS = [
  './',
  './index.html',
  './content.html',
  './premium.html',
  './offline.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/cache-names.js',
  './assets/js/config.js',
  './assets/js/sw-register.js',
  './assets/js/app.js',
  './assets/js/render-article.js',
  './assets/js/content.js',
  './assets/js/premium.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon-180.png',
  './assets/icons/favicon-32.png',
];

// 無料サンプル記事も、インストール時にまとめて保存する。
// これが無いと、サンプル記事を一度も開かないままオフラインにした端末では
// 本文を取得できず「読み込めませんでした」になる。
//
// 有料コンテンツはここに含めない。購入前に配ってしまうことになるうえ、
// そもそもリポジトリには置いていない（GASから取得する）。
// 記事を増やしたらここにも足すこと。
// 漏れは node tools/check-offline-precache.mjs で検出できる。
const CONTENT_ASSETS = [
  './content/index.json',
  './content/what-is-ai.json',
  './content/figures/ai-overview.svg',
  './content/figures/prompt-flow.svg',
  './content/figures/screenshot-sample.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const [shellCache, contentCache] = await Promise.all([
        caches.open(SHELL_CACHE),
        caches.open(CONTENT_CACHE),
      ]);
      // addAllは追加するだけなので、購入済みの記事は消えない
      await Promise.all([
        shellCache.addAll(SHELL_ASSETS),
        contentCache.addAll(CONTENT_ASSETS),
      ]);
      // 新しいService Workerを待機させず、すぐ有効にする
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('ai-content-app-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      // 開いているタブを、リロードなしでこのService Workerの管理下に入れる
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 送信系（POSTなど）には手を出さない
  if (request.method !== 'GET') return;

  // 外部への通信（将来のGAS API・決済など）は素通しする。
  // ここでキャッシュを挟むと、最新でない応答を返して不具合の原因になる。
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ページを開くとき: ネットワーク優先。表示内容が常に最新になる。
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // コンテンツ本体はコンテンツ用キャッシュへ、それ以外はアプリ本体用へ。
  // 保存先を分けておくと、フェーズ3で「購入したコンテンツだけ保存する／消す」
  // 処理を書くときに、アプリ本体のキャッシュを巻き込まずに済む。
  const isContent = url.pathname.includes('/content/');

  // CSS・JS・画像・コンテンツ: キャッシュ優先。
  // 一度取得したものはオフラインで確実に読める。
  event.respondWith(cacheFirst(request, isContent ? CONTENT_CACHE : SHELL_CACHE));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response('オフラインです', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
}
