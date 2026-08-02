/**
 * Service Worker — オフライン対応の土台。
 *
 * このファイルはサイトのルート直下に置くこと。
 * Service Workerは自身が置かれた階層より下しか制御できないため、
 * サブディレクトリに移すとアプリ全体をオフライン化できなくなる。
 */

// キャッシュした内容を入れ替えたいときは、この番号を上げる。
// 古い番号のキャッシュはactivate時に自動で削除される。
const VERSION = 'v1';

// アプリの外側（画面を出すのに必要なファイル）と、
// コンテンツ本体を最初から分けておく。
// 将来「決済完了後にコンテンツだけダウンロード／削除する」ときに、
// アプリ本体のキャッシュを巻き込まずに済むため。
const SHELL_CACHE = `ai-content-app-shell-${VERSION}`;
const CONTENT_CACHE = `ai-content-app-content-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, CONTENT_CACHE];

const OFFLINE_URL = './offline.html';

// インストール時にまとめて保存するファイル
const SHELL_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon-180.png',
  './assets/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS);
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
  if (new URL(request.url).origin !== self.location.origin) return;

  // ページを開くとき: ネットワーク優先。表示内容が常に最新になる。
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // CSS・JS・画像: キャッシュ優先。表示が速くなる。
  event.respondWith(cacheFirst(request));
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

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
}
