/**
 * トップページのインストール導線。
 * Service Workerの登録は sw-register.js が担当する。
 */
(() => {
  'use strict';

  const statusEl = document.getElementById('status');
  const installButton = document.getElementById('install-button');
  const iosHint = document.getElementById('ios-hint');

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  // すでにホーム画面から起動しているなら、インストールの案内は出さない
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isStandalone) return;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOSはデスクトップ版Safariを名乗るため、タッチの有無で見分ける
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
