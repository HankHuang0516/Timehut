(() => {
  let deferredPrompt = null, ready = false, busy = false, installedEvent = false, message = '';
  const displayMode = matchMedia('(display-mode: standalone)');
  let platform = /Android/.test(navigator.userAgent) ? 'android' : 'ios';
  const element = id => document.getElementById(id);
  const nativeApp = () => { try { return window.Capacitor?.isNativePlatform?.() === true; } catch { return false; } };
  const standalone = () => displayMode.matches || navigator.standalone === true;

  function render() {
    if (!ready) return;
    const native = nativeApp(), opened = standalone(), installed = installedEvent || opened;
    element('installStatus').textContent = native ? '目前使用手機 App；網頁 App 安裝指引適用於瀏覽器。'
      : opened ? '已以獨立 App 視窗開啟。'
      : installedEvent ? '網頁 App 已安裝。請從主畫面開啟小屋。'
      : message || (deferredPrompt ? '此裝置支援安裝獨立網頁 App。' : '請依所選平台的步驟安裝；瀏覽器符合條件時也會顯示安裝按鈕。');
    element('webInstallBadge').textContent = native ? '網頁版本' : opened ? '使用中' : installed ? '已安裝' : '安裝指引';
    element('nativeInstallBadge').textContent = native ? '使用中' : 'Android 測試版';
    element('nativeInstallStatus').textContent = native ? '目前正以手機 App 開啟。Android 16 背景傳輸測試已通過，實體手機與省電設定仍需確認。' : 'Android 測試版已提供，可與原版並存。iPhone 手機版尚未提供。';
    element('androidDownload').hidden = native;
    const button = element('installButton');
    button.hidden = native || installed || (!deferredPrompt && !busy);
    button.disabled = busy;
    button.textContent = busy ? '等待手機提示…' : '安裝黃家小屋';
    element('installGuide').hidden = native || installed;
    element('iosInstallSteps').hidden = platform !== 'ios';
    element('androidInstallSteps').hidden = platform !== 'android';
    document.querySelectorAll('[data-install-platform]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.installPlatform === platform)));
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (nativeApp() || standalone() || installedEvent) return;
    deferredPrompt = event;
    if (!busy) message = '';
    render();
  });
  window.addEventListener('appinstalled', () => { installedEvent = true; deferredPrompt = null; message = ''; render(); });
  displayMode.addEventListener?.('change', render);

  document.addEventListener('DOMContentLoaded', () => {
    ready = true;
    document.querySelectorAll('[data-install-platform]').forEach(button => button.addEventListener('click', () => { platform = button.dataset.installPlatform; render(); }));
    element('installButton').addEventListener('click', async () => {
      if (busy || !deferredPrompt || nativeApp() || standalone() || installedEvent) return;
      const request = deferredPrompt;
      deferredPrompt = null; busy = true; message = '請在手機提示中確認是否安裝。'; render();
      try {
        await request.prompt();
        const result = await request.userChoice;
        // Rendering always prioritizes the actual installed/opened state over this late result.
        message = result?.outcome === 'accepted' ? '已送出安裝要求，請依手機提示完成。' : '這次沒有安裝。可依下方步驟重新操作。';
      } catch {
        message = '安裝提示未能開啟。請依下方步驟安裝，或稍後重新載入頁面。';
      } finally { busy = false; render(); }
    });
    render();
  });
})();
