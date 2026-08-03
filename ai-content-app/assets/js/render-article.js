/**
 * 記事の描画。取得元（リポジトリのJSON / GAS）を問わず、
 * ブロックの配列を受け取ってDOMを組み立てるだけを担当する。
 *
 * 文字はすべてtextContentで入れ、innerHTMLは使わない。
 * 有料記事のデータは外部（GAS）から届くため、HTMLとして解釈させると
 * 受け取った文字列がそのままスクリプトとして動いてしまう。
 */
window.ArticleRenderer = (() => {
  'use strict';

  /**
   * ブロック1つ分の要素を作る。
   * @param {object} block
   * @param {string} baseUrl 画像の相対パスを解決する基準。データURIならそのまま使う
   */
  function buildBlock(block, baseUrl) {
    switch (block.type) {
      case 'heading': {
        const el = document.createElement('h2');
        el.textContent = block.text;
        return el;
      }

      case 'paragraph': {
        const el = document.createElement('p');
        el.textContent = block.text;
        return el;
      }

      case 'list': {
        const list = document.createElement('ul');
        for (const item of block.items ?? []) {
          const li = document.createElement('li');
          li.textContent = item;
          list.appendChild(li);
        }
        return list;
      }

      case 'figure': {
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        img.src = block.src.startsWith('data:') ? block.src : new URL(block.src, baseUrl).href;
        img.alt = block.alt ?? '';
        img.loading = 'lazy';
        figure.appendChild(img);

        if (block.caption) {
          const caption = document.createElement('figcaption');
          caption.textContent = block.caption;
          figure.appendChild(caption);
        }
        return figure;
      }

      case 'note': {
        const el = document.createElement('aside');
        el.className = 'note';
        el.textContent = block.text;
        return el;
      }

      default:
        // 知らない種類は無視する。将来ブロックが増えても、
        // 古いバージョンのアプリが壊れないようにするため。
        return null;
    }
  }

  /**
   * 記事を画面へ描画する。
   * @param {object} article {title, subtitle, updatedAt, blocks}
   * @param {object} targets {titleEl, metaEl, bodyEl}
   * @param {string} baseUrl 画像パスの基準
   */
  function render(article, targets, baseUrl) {
    document.title = `${article.title} — はじめてのAI学習`;
    targets.titleEl.textContent = article.title;

    targets.metaEl.textContent = [article.subtitle, article.updatedAt && `${article.updatedAt} 更新`]
      .filter(Boolean)
      .join(' ・ ');

    const fragment = document.createDocumentFragment();
    for (const block of article.blocks ?? []) {
      const el = buildBlock(block, baseUrl);
      if (el) fragment.appendChild(el);
    }

    targets.bodyEl.textContent = '';
    targets.bodyEl.appendChild(fragment);
  }

  return { render };
})();
