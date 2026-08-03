/**
 * 有料記事の解錠と読み込み。
 *
 * 1枚の画面で2つの状態を持つ。未解錠ならコード入力欄、解錠済みなら記事本文。
 * 描画そのものは render-article.js が担当する。
 */
(() => {
  'use strict';

  const APP_ROOT = new URL('../../', document.currentScript.src);

  // サーバー上に実在しないURLだが、content/ 以下に置くことで
  // Service Workerのキャッシュ振り分けと削除処理がそのまま適用される。
  const ARTICLE_URL = new URL('content/premium-article.json', APP_ROOT).href;

  const KEY_DEVICE = 'aiapp.deviceId';
  const KEY_CODE = 'aiapp.unlockedCode';

  const lockedSection = document.getElementById('locked');
  const articleSection = document.getElementById('article-wrap');
  const noticeEl = document.getElementById('premium-notice');
  const form = document.getElementById('unlock-form');
  const input = document.getElementById('code-input');
  const submitButton = document.getElementById('unlock-button');
  const errorEl = document.getElementById('unlock-error');

  const targets = {
    titleEl: document.getElementById('article-title'),
    metaEl: document.getElementById('article-meta'),
    bodyEl: document.getElementById('article'),
  };

  // ---- 端末ID ----------------------------------------------------------

  /** 端末を見分けるための乱数。個人情報は含まない。 */
  function getDeviceId() {
    let id = safeStorageGet(KEY_DEVICE);
    if (id) return id;

    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

    safeStorageSet(KEY_DEVICE, id);
    return id;
  }

  // プライベートモードなどでlocalStorageが使えないことがある
  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 保存できなくても動作は続ける */
    }
  }

  // ---- GASとの通信 -----------------------------------------------------

  /**
   * GASへリクエストを送る。
   *
   * Content-Typeを text/plain にしているのは意図的。GASは事前確認の通信
   * （CORSプリフライト）に応答できず、application/json で送ると失敗するため。
   *
   * cache: 'no-store' も必須。GASはPOSTに対して使い捨ての転送先URLを返すため、
   * ブラウザが応答をキャッシュすると、2回目以降に使用済みのURLへ飛んで404になる。
   */
  const RETRY_DELAYS_MS = [800, 3000];

  async function callBackend(payload, attempt = 0) {
    try {
      const response = await fetch(window.AppConfig.GAS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        cache: 'no-store',
        credentials: 'omit',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      // GASは混雑時に一時的な失敗を返すことがある。少し待って掛け直す。
      //
      // 掛け直しても二重登録にはならない。GAS側は同じ（コード, 端末ID）の
      // 組をすでに登録済みとみなし、台数を増やさず通すため。
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        return callBackend(payload, attempt + 1);
      }
      throw error;
    }
  }

  // ---- 保存と読み出し ---------------------------------------------------

  async function storeArticle(article) {
    const cache = await caches.open(self.CacheNames.CONTENT);
    await cache.put(
      ARTICLE_URL,
      new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }

  async function loadStoredArticle() {
    try {
      const hit = await caches.match(ARTICLE_URL);
      return hit ? await hit.json() : null;
    } catch {
      return null;
    }
  }

  // ---- 画面の切り替え ---------------------------------------------------

  function showArticle(article) {
    window.ArticleRenderer.render(article, targets, APP_ROOT);
    lockedSection.hidden = true;
    articleSection.hidden = false;
  }

  function showLocked() {
    lockedSection.hidden = false;
    articleSection.hidden = true;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function showNotice(message) {
    noticeEl.textContent = message;
    noticeEl.hidden = !message;
  }

  /** サーバーからの応答を、画面に出す日本語に変換する */
  function messageForFailure(result) {
    if (result?.message) return result.message;

    switch (result?.error) {
      case 'invalid_code':
        return 'このコードは登録されていません。入力内容をご確認ください。';
      case 'revoked':
        return 'このコードは現在ご利用いただけません。';
      case 'device_limit':
        return `このコードで利用できる端末数の上限（${window.AppConfig.DEVICE_LIMIT_HINT}台）に達しています。`;
      default:
        return 'エラーが発生しました。しばらくしてからもう一度お試しください。';
    }
  }

  // ---- 解錠 -------------------------------------------------------------

  /**
   * コードで解錠を試みる。
   * @param {string} code
   * @param {boolean} silent 保存済みコードでの自動再取得なら true
   */
  async function unlock(code, silent) {
    const result = await callBackend({
      action: 'unlock',
      code,
      deviceId: getDeviceId(),
    });

    if (!result.ok) {
      if (!silent) showError(messageForFailure(result));
      return false;
    }

    await storeArticle(result.article);
    safeStorageSet(KEY_CODE, code);
    showError('');
    showArticle(result.article);
    return true;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const code = input.value.trim();
    if (!code) {
      showError('コードを入力してください。');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = '確認しています…';
    showError('');

    try {
      await unlock(code, false);
    } catch (error) {
      console.error('解錠に失敗', error);
      showError('サーバーに接続できませんでした。通信状況を確認して、もう一度お試しください。');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = '解錠する';
    }
  });

  // ---- 起動時 -----------------------------------------------------------

  /**
   * オンラインのとき、コードがまだ有効かを確かめる。
   *
   * 無効化されていても表示中の内容は消さない。既に読める状態のものを突然消すと、
   * 通信の一時的な失敗と区別がつかず、正当な購入者の体験を損なうため。
   * 効くのは次回以降のダウンロードに対してである。
   */
  async function verifyInBackground(code) {
    try {
      const result = await callBackend({ action: 'check', code });
      if (!result.ok) showNotice(messageForFailure(result));
    } catch {
      /* 通信できないだけなら何も言わない */
    }
  }

  (async () => {
    const savedCode = safeStorageGet(KEY_CODE);
    const stored = await loadStoredArticle();

    // 1. 保存済みの記事があれば、まず表示する（オフラインでも読める）
    if (stored) {
      showArticle(stored);
      if (savedCode && navigator.onLine) verifyInBackground(savedCode);
      return;
    }

    // 2. 記事は無いがコードは残っている場合、黙って取り直す
    if (savedCode) {
      try {
        if (await unlock(savedCode, true)) return;
      } catch {
        /* オフラインなどで取れなければ、入力欄を出す */
      }
    }

    // 3. どちらも無ければコード入力欄
    showLocked();
  })();
})();
