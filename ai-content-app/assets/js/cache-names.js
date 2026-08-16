/**
 * キャッシュ名の定義。
 *
 * Service Worker（sw.js）と画面側（premium.js）の両方が同じキャッシュを読み書きする。
 * 名前を2か所に書くと、片方だけ直したときに保存先がずれて不具合になるため、
 * ここを唯一の定義とし、両方から読み込む。
 *   - sw.js からは importScripts で
 *   - 画面からは <script> タグで
 * どちらの文脈でも使えるよう self に置いている（画面では self === window）。
 *
 * キャッシュした内容を入れ替えたいときは、対応するバージョンを上げる。
 * SHELLとCONTENTでバージョンを分けているのは、アプリを修正するたびに
 * 購入済みのコンテンツまで消えてしまうのを防ぐため。
 */
(() => {
  'use strict';

  const SHELL_VERSION = 'v4';
  const CONTENT_VERSION = 'v1';

  self.CacheNames = {
    PREFIX: 'ai-content-app-',
    SHELL: `ai-content-app-shell-${SHELL_VERSION}`,
    CONTENT: `ai-content-app-content-${CONTENT_VERSION}`,
  };
})();
