export function setupPwa() {
  const worker = navigator.serviceWorker;
  if (!worker) return;

  const install = document.querySelector('#install-app');
  const update = document.querySelector('#update-app');
  const status = document.querySelector('#offline-status');
  const feedback = document.querySelector('#update-status');
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
  let checking = false;
  let noticeTimer;

  function announce(message) {
    clearTimeout(noticeTimer);
    feedback.textContent = message;
    noticeTimer = setTimeout(() => { feedback.textContent = ''; }, 6000);
  }

  function render() {
    const offlineReady = Boolean(worker.controller);
    const runningStandalone = standalone.matches || navigator.standalone;
    install.hidden = !offlineReady || installed || runningStandalone || !(promptEvent || (ios && safari));
    install.disabled = installing;
    const waiting = Boolean(registration?.waiting);
    update.hidden = !registration || !offlineReady;
    update.disabled = updating || checking;
    update.textContent = updating ? '更新中' : waiting ? '有新版' : checking ? '检查中' : '更新';
    update.setAttribute('aria-label', waiting ? '安装新版本' : '检查更新');
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
  function waitForInstallation(candidate) {
    if (candidate.state !== 'installing') return Promise.resolve(candidate.state);
    return new Promise(resolve => {
      function finish() {
        clearTimeout(timer);
        candidate.removeEventListener('statechange', onChange);
        resolve(candidate.state);
      }
      function onChange() {
        if (candidate.state !== 'installing') finish();
      }
      const timer = setTimeout(finish, 8000);
      candidate.addEventListener('statechange', onChange);
      onChange();
    });
  }

  async function checkForUpdate(manual = false) {
    if (!registration || !worker.controller || checking || updating || registration.waiting) return;
    if (navigator.onLine === false) {
      if (manual) announce('当前离线，请联网后检查更新');
      return;
    }
    checking = true;
    render();
    try {
      if (!registration.installing) await registration.update();
      const candidate = registration.installing;
      const state = candidate && await waitForInstallation(candidate);
      if (manual) {
        if (registration.waiting) announce('新版已就绪，点「有新版」安装');
        else if (state === 'installing') announce('新版正在准备，请稍候');
        else if (state === 'redundant') announce('新版准备失败，请重试');
        else announce('当前已是最新版本');
      }
    } catch {
      if (manual) announce('检查更新失败，请联网后重试');
    } finally {
      checking = false;
      render();
    }
  }

  update.addEventListener('click', () => {
    const waiting = registration?.waiting;
    if (!waiting) {
      void checkForUpdate(true);
      return;
    }
    updating = true;
    feedback.textContent = '';
    render();
    waiting.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => {
      updating = false;
      render();
      announce('更新未完成，请重试');
    }, 12000);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForUpdate();
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
      if (!document.hidden) void checkForUpdate();
    })
    .catch(() => {
      if (!worker.controller) status.textContent = '离线准备失败，联网后刷新可重试';
    });
}
