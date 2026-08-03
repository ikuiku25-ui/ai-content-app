/**
 * 無料サンプル記事の読み込み。
 * 描画は render-article.js が担当する。
 */
(() => {
  'use strict';

  const APP_ROOT = new URL('../../', document.currentScript.src);
  const SOURCE = new URL('content/lesson-01.json', APP_ROOT);

  const statusEl = document.getElementById('article-status');

  const targets = {
    titleEl: document.getElementById('article-title'),
    metaEl: document.getElementById('article-meta'),
    bodyEl: document.getElementById('article'),
  };

  (async () => {
    try {
      const response = await fetch(SOURCE);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      window.ArticleRenderer.render(await response.json(), targets, APP_ROOT);
      statusEl.hidden = true;
    } catch (error) {
      statusEl.textContent =
        'コンテンツを読み込めませんでした。通信状況を確認して、もう一度お試しください。';
      console.error('コンテンツの読み込みに失敗', error);
    }
  })();
})();
