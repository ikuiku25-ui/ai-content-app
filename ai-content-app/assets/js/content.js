/**
 * 記事の描画。
 *
 * 本文をHTMLに直接書かず、JSONから読み込んで組み立てている。
 * フェーズ3で取得先をGAS（購入者だけが取得できるAPI）に変えるとき、
 * このファイルのfetch先を差し替えるだけで済むようにするため。
 */
(() => {
  'use strict';

  const APP_ROOT = new URL('../../', document.currentScript.src);
  const SOURCE = new URL('content/lesson-01.json', APP_ROOT);

  const articleEl = document.getElementById('article');
  const titleEl = document.getElementById('article-title');
  const metaEl = document.getElementById('article-meta');
  const statusEl = document.getElementById('article-status');

  /**
   * ブロック1つ分の要素を作る。
   *
   * 文字はすべてtextContentで入れ、innerHTMLは使わない。
   * このデータは将来外部から届くため、HTMLとして解釈させると
   * 受け取った文字列がそのままスクリプトとして動いてしまう。
   */
  function buildBlock(block) {
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
        img.src = new URL(block.src, APP_ROOT).href;
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

  function render(article) {
    document.title = `${article.title} — はじめてのAI学習`;
    titleEl.textContent = article.title;

    const meta = [article.subtitle, article.updatedAt && `${article.updatedAt} 更新`]
      .filter(Boolean)
      .join(' ・ ');
    metaEl.textContent = meta;

    const fragment = document.createDocumentFragment();
    for (const block of article.blocks ?? []) {
      const el = buildBlock(block);
      if (el) fragment.appendChild(el);
    }
    articleEl.appendChild(fragment);
    statusEl.hidden = true;
  }

  (async () => {
    try {
      const response = await fetch(SOURCE);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      render(await response.json());
    } catch (error) {
      statusEl.textContent =
        'コンテンツを読み込めませんでした。通信状況を確認して、もう一度お試しください。';
      console.error('コンテンツの読み込みに失敗', error);
    }
  })();
})();
