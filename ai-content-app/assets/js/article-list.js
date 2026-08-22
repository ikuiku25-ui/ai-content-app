/**
 * トップページの「学びの地図」。
 *
 * 平らな一覧ではなく、幹（level 1）と枝（level 2）の関係が見える形で並べる。
 * どこから読み始めて、どこで枝分かれするのかを、読む前に掴めるようにするため。
 *
 * まだ書いていない記事（status: planned）も地図には載せる。
 * 先に何があるかが見えていること自体が、全体像の理解につながる。
 */
(() => {
  'use strict';

  const listEl = document.getElementById('article-list');
  const statusEl = document.getElementById('article-list-status');

  /** 記事1件分の中身（見出し・紹介文）を組み立てる */
  function buildCardContent(article, stepNumber) {
    const fragment = document.createDocumentFragment();

    const heading = document.createElement('span');
    heading.className = 'article-card__title';

    // 幹には通し番号を振り、読む順番を示す
    if (stepNumber) {
      const step = document.createElement('span');
      step.className = 'article-card__step';
      step.textContent = stepNumber;
      heading.appendChild(step);
    }

    heading.appendChild(document.createTextNode(article.title));
    fragment.appendChild(heading);

    if (article.summary) {
      const summary = document.createElement('span');
      summary.className = 'article-card__summary';
      summary.textContent = article.summary;
      fragment.appendChild(summary);
    }

    return fragment;
  }

  function buildItem(article, stepNumber) {
    const item = document.createElement('li');
    item.className = article.level === 2 ? 'articles__item articles__item--branch' : 'articles__item';

    const planned = window.ArticleSource.isPlanned(article);

    // 準備中はリンクにしない。押せる見た目にすると、押して失敗する
    const card = document.createElement(planned ? 'div' : 'a');
    card.className = planned ? 'article-card article-card--planned' : 'article-card';
    if (!planned) card.href = `content.html?id=${encodeURIComponent(article.id)}`;

    card.appendChild(buildCardContent(article, stepNumber));

    if (planned) {
      const badge = document.createElement('span');
      badge.className = 'article-card__badge';
      badge.textContent = '準備中';
      card.appendChild(badge);
    }

    item.appendChild(card);
    return item;
  }

  (async () => {
    try {
      // 依存の確認はtryの内側で。外に出すと、読み込めていないときに
      // 例外が素通りして「読み込んでいます」のまま止まる。
      if (!window.ArticleSource) {
        throw new Error('必要なスクリプトが読み込まれていません');
      }

      const index = await window.ArticleSource.loadIndex();
      const articles = index.articles ?? [];

      if (!articles.length) {
        statusEl.textContent = '記事を準備しています。';
        return;
      }

      const fragment = document.createDocumentFragment();
      let step = 0;
      for (const article of articles) {
        const isTrunk = article.level !== 2;
        if (isTrunk) step += 1;
        fragment.appendChild(buildItem(article, isTrunk ? step : null));
      }
      listEl.appendChild(fragment);
      statusEl.hidden = true;
    } catch (error) {
      statusEl.hidden = false;
      statusEl.textContent =
        '記事の一覧を読み込めませんでした。インターネットに接続した状態で開き直してください。';
      console.error('目次の読み込みに失敗', error);
    }
  })();
})();
