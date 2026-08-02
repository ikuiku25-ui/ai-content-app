/**
 * Service Workerの登録。全ページで読み込む。
 *
 * 画面ごとの機能（インストール導線や記事の描画）とは分けてある。
 * どのページから入ってもオフライン対応が有効になるようにするため。
 */
(() => {
  'use strict';

  // このファイルは assets/js/ にあるので、2つ上がアプリのルート。
  // ページ側のURLではなくスクリプトの位置を基準にすることで、
  // 将来サブフォルダにページを増やしてもsw.jsの場所を見失わない。
  const APP_ROOT = new URL('../../', document.currentScript.src);

  // 状態表示はトップページにしか無いので、あれば更新する
  const statusEl = document.getElementById('status');
  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  if (!('serviceWorker' in navigator)) {
    // httpsでもlocalhostでもない場合や、対応していないブラウザの場合
    setStatus('このブラウザではオフライン機能を利用できません。');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(new URL('sw.js', APP_ROOT), { scope: APP_ROOT });
      setStatus(
        isStandalone
          ? 'アプリとして起動中です。オフラインでも開けます。'
          : 'オフラインでも開けるよう準備しました。'
      );
    } catch (error) {
      setStatus(`オフライン準備に失敗しました: ${error.message}`);
    }
  });
})();
