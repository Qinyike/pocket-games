export function setupPwa() {
  const worker = navigator.serviceWorker;
  if (!worker) return;

  const install = document.querySelector('#install-app');
  const update = document.querySelector('#update-app');
  const status = document.querySelector('#offline-status');
  const guide = document.querySelector('#install-guide');
  const standalone = matchMedia('(display-mode: standalone)');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

  let registration;
  let promptEvent;
  let installed = false;
  let installing = false;
  let updating = false;

  function render() {
    const offlineReady = Boolean(worker.controller);
    const runningStandalone = standalone.matches || navigator.standalone;
    install.hidden = !offlineReady || installed || runningStandalone || !(promptEvent || (ios && safari));
    install.disabled = installing;
    update.hidden = !registration?.waiting || !offlineReady;
    update.disabled = updating;
    status.textContent = offlineReady ? '触屏 · 键盘 · 可离线游玩' : '支持触屏和键盘';
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    promptEvent = undefined;
    render();
  });
  standalone.addEventListener?.('change', render);

  install.addEventListener('click', async () => {
    if (!promptEvent) {
      guide.showModal();
      return;
    }

    const request = promptEvent;
    promptEvent = undefined;
    installing = true;
    install.disabled = true;
    try {
      const choice = await request.prompt();
      installed ||= choice?.outcome === 'accepted';
    } catch {
      installing = false;
      render();
      status.textContent = '可通过浏览器菜单安装';
      return;
    }
    installing = false;
    render();
  });

  worker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
    else render();
  });
  update.addEventListener('click', () => {
    const waiting = registration?.waiting;
    if (!waiting) {
      render();
      return;
    }
    updating = true;
    update.textContent = '更新中';
    render();
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });

  function watchInstallation() {
    registration.installing?.addEventListener('statechange', render);
    render();
  }

  const scope = new URL('../', import.meta.url);
  worker.register(new URL('sw.js', scope), { scope: scope.href, updateViaCache: 'none' })
    .then(result => {
      registration = result;
      registration.addEventListener('updatefound', watchInstallation);
      watchInstallation();
    })
    .catch(() => {
      if (!worker.controller) status.textContent = '离线准备失败，联网后刷新可重试';
    });
}
