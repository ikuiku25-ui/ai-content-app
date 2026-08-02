/**
 * Service Workerの登録と、インストール導線。
 */
(() => {
  'use strict';

  // このファイルは assets/js/ にあるので、2つ上がアプリのルート。
  // ページ側のURLではなくスクリプトの位置を基準にすることで、
  // 将来サブフォルダにページを増やしてもsw.jsの場所を見失わない。
  const APP_ROOT = new URL('../../', document.currentScript.src);

  const statusEl = document.getElementById('status');
  const installButton = document.getElementById('install-button');
  const iosHint = document.getElementById('ios-hint');

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  // すでにホーム画面から起動している状態か
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOSはデスクトップ版Safariを名乗るため、タッチの有無で見分ける
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // --- Service Workerの登録 ---
  if ('serviceWorker' in navigator) {
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
  } else {
    // httpsでもlocalhostでもない場合や、対応していないブラウザの場合
    setStatus('このブラウザではオフライン機能を利用できません。');
  }

  // --- インストール導線 ---
  // すでにインストール済みで起動しているなら、案内は出さない
  if (isStandalone) return;

  // Android・PCのChrome / Edgeなど。
  // インストール可能になった時点でブラウザがこのイベントを発火する。
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    // ブラウザ標準のバナーを止め、こちらのボタンから出す
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installButton.disabled = true;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    // promptは1回しか使えないので、使ったら捨てる
    deferredPrompt = null;
    installButton.hidden = true;
    installButton.disabled = false;

    if (outcome === 'dismissed') {
      setStatus('インストールはキャンセルされました。');
    }
  });

  window.addEventListener('appinstalled', () => {
    installButton.hidden = true;
    setStatus('インストールが完了しました。');
  });

  // iOS Safariはbeforeinstallpromptに対応していないため、手順を案内する
  if (isIOS) {
    iosHint.hidden = false;
  }
})();
