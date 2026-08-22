/**
 * 無料記事の目次の読み込み。
 *
 * トップページの一覧（article-list.js）と、記事ページ（content.js）の
 * 両方が目次を必要とするため、ここにまとめてある。
 */
window.ArticleSource = (() => {
  'use strict';

  // このファイルは assets/js/ にあるので、2つ上がアプリのルート
  const APP_ROOT = new URL('../../', document.currentScript.src);
  const INDEX_URL = new URL('content/index.json', APP_ROOT);

  /** 目次を読む。{ articles: [{id, title, summary}] } */
  async function loadIndex() {
    const response = await fetch(INDEX_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /** これから書く予定の記事か。本文ファイルはまだ無い。 */
  function isPlanned(article) {
    return article.status === 'planned';
  }

  /**
   * 目次に載っていて、かつ本文がある記事だけを受け付ける。
   *
   * ?id= はURLに現れるので誰でも書き換えられる。目次と突き合わせずに
   * content/<id>.json を組み立てると、"../" を含むIDで意図しないファイルを
   * 読ませる余地ができる。取得先は必ず目次にある記事から決める。
   *
   * 準備中の記事も弾く。地図には載せるが本文はまだ無いため、
   * 開こうとしても読み込みに失敗するだけになる。
   */
  function findArticle(index, id) {
    const article = (index.articles ?? []).find((entry) => entry.id === id);
    return article && !isPlanned(article) ? article : null;
  }

  /** 記事本体のURL。IDは findArticle を通ったものだけを渡すこと。 */
  function articleUrl(id) {
    return new URL(`content/${id}.json`, APP_ROOT);
  }

  return { APP_ROOT, loadIndex, findArticle, articleUrl, isPlanned };
})();
