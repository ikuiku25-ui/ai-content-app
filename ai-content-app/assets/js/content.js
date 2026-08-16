/**
 * 無料記事の読み込み。どの記事を出すかは ?id= で決まる。
 * 目次の扱いは article-source.js、描画は render-article.js が担当する。
 */
(() => {
  'use strict';

  const { APP_ROOT, loadIndex, findArticle, articleUrl } = window.ArticleSource;

  const statusEl = document.getElementById('article-status');
  const targets = {
    titleEl: document.getElementById('article-title'),
    metaEl: document.getElementById('article-meta'),
    bodyEl: document.getElementById('article'),
  };

  (async () => {
    try {
      const id = new URLSearchParams(location.search).get('id');
      const index = await loadIndex();
      const entry = findArticle(index, id);

      // 目次にないIDや、IDの指定がない場合は一覧へ戻す
      if (!entry) {
        location.replace('index.html');
        return;
      }

      const response = await fetch(articleUrl(entry.id));
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
