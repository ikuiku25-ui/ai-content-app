/**
 * 無料記事の読み込み。どの記事を出すかは ?id= で決まる。
 * 目次の扱いは article-source.js、描画は render-article.js が担当する。
 */
(() => {
  'use strict';

  const statusEl = document.getElementById('article-status');
  const targets = {
    titleEl: document.getElementById('article-title'),
    metaEl: document.getElementById('article-meta'),
    bodyEl: document.getElementById('article'),
  };

  function showFailure(message) {
    statusEl.hidden = false;
    statusEl.textContent = message;
    targets.titleEl.textContent = '記事を表示できません';
  }

  (async () => {
    try {
      // 依存するスクリプトの確認を、必ずtryの内側で行う。
      // ここを外に出すと、読み込めていないときに例外が素通りし、
      // 画面が「読み込んでいます」のまま無言で止まってしまう。
      if (!window.ArticleSource || !window.ArticleRenderer) {
        throw new Error('必要なスクリプトが読み込まれていません');
      }

      const { APP_ROOT, loadIndex, findArticle, articleUrl } = window.ArticleSource;

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
      showFailure(
        'アプリのデータが古い可能性があります。インターネットに接続した状態で、' +
          'アプリをいったん閉じてから開き直してください。'
      );
      console.error('コンテンツの読み込みに失敗', error);
    }
  })();
})();
