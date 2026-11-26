/**
 * PWA 更新检测。
 *
 * - 新版本 Service Worker 安装完成后会进入 waiting 状态
 * - 页面亮起「新版本」，用户点击后发送 SKIP_WAITING
 * - controllerchange 时刷新页面，让新缓存接管
 */

import { APP_VERSION } from './version.js';
import { toast } from './ui.js';

export class UpdateManager {
  constructor({ button, label }) {
    this.button = button;
    this.label = label;
    this.registration = null;
    this.checking = false;
    this.applying = false;
    this.hadController = Boolean(navigator.serviceWorker?.controller);

    button.addEventListener('click', () => {
      if (this.button.classList.contains('has-update')) this.apply();
      else this.check();
    });

    this.init();
  }

  async init() {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) {
      this.button.title = '当前环境不支持自动更新';
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        updateViaCache: 'none',
      });
      this.registration = registration;

      if (registration.waiting && this.hadController) this.markAvailable();

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            this.markAvailable();
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.applying) {
          window.location.reload();
        }
      });

      window.setTimeout(() => this.check({ silent: true }), 3500);
    } catch {
      this.button.title = '更新服务初始化失败';
    }
  }

  setBusy(busy) {
    this.checking = busy;
    this.button.classList.toggle('is-checking', busy);
    if (busy) this.label.textContent = '检查中';
    else if (!this.button.classList.contains('has-update')) this.label.textContent = '更新';
  }

  markAvailable() {
    this.button.classList.add('has-update');
    this.label.textContent = '新版本';
    this.button.setAttribute('aria-label', '有新版本，点击立即更新');
    this.button.title = '发现新版本，点击更新';
    toast('发现新版本，点右上角「新版本」更新');
  }

  async check({ silent = false } = {}) {
    if (this.checking) return;
    if (!this.registration) {
      if (!silent) toast('当前浏览器不支持自动更新');
      return;
    }
    this.setBusy(true);
    try {
      await this.registration.update();
      if (this.registration.waiting) {
        this.markAvailable();
        if (!silent) toast('新版本已准备好');
        return;
      }
      if (this.registration.installing) {
        const installed = await this.waitForInstall(this.registration.installing);
        if (installed && this.registration.waiting) {
          this.markAvailable();
          if (!silent) toast('新版本已准备好');
          return;
        }
      }
      if (!silent) toast(`已是最新版本 v${APP_VERSION}`);
    } catch {
      if (!silent) toast('网络不可用，稍后再试');
    } finally {
      this.setBusy(false);
    }
  }

  waitForInstall(worker) {
    return new Promise((resolve) => {
      if (worker.state === 'installed') {
        resolve(true);
        return;
      }
      if (worker.state === 'redundant') {
        resolve(false);
        return;
      }
      const timer = window.setTimeout(() => resolve(false), 6000);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' || worker.state === 'redundant') {
          window.clearTimeout(timer);
          resolve(worker.state === 'installed');
        }
      });
    });
  }

  async apply() {
    if (this.applying) return;
    const waiting = this.registration?.waiting;
    if (!waiting) {
      await this.check();
      return;
    }
    this.applying = true;
    this.button.classList.add('is-checking');
    this.label.textContent = '更新中';
    waiting.postMessage({ type: 'SKIP_WAITING' });
    window.setTimeout(() => {
      if (this.applying) window.location.reload();
    }, 4000);
  }
}
