/**
 * トップページの記事一覧。
 */
(() => {
  'use strict';

  const { loadIndex } = window.ArticleSource;

  const listEl = document.getElementById('article-list');
  const statusEl = document.getElementById('article-list-status');

  function buildItem(article) {
    const item = document.createElement('li');

    const link = document.createElement('a');
    link.className = 'article-card';
    link.href = `content.html?id=${encodeURIComponent(article.id)}`;

    const title = document.createElement('span');
    title.className = 'article-card__title';
    title.textContent = article.title;
    link.appendChild(title);

    if (article.summary) {
      const summary = document.createElement('span');
      summary.className = 'article-card__summary';
      summary.textContent = article.summary;
      link.appendChild(summary);
    }

    item.appendChild(link);
    return item;
  }

  (async () => {
    try {
      const index = await loadIndex();
      const articles = index.articles ?? [];

      if (!articles.length) {
        statusEl.textContent = '記事を準備しています。';
        return;
      }

      const fragment = document.createDocumentFragment();
      for (const article of articles) fragment.appendChild(buildItem(article));
      listEl.appendChild(fragment);
      statusEl.hidden = true;
    } catch (error) {
      statusEl.textContent = '記事の一覧を読み込めませんでした。';
      console.error('目次の読み込みに失敗', error);
    }
  })();
})();
