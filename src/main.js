import {
  state,
  setSetting,
  resetProgress,
  sokobanCompletedCount,
  platformCompletedCount,
} from './core/storage.js';
import {
  setSoundEnabled,
  setMusicEnabled,
  unlockAudio,
  playSound,
  startMusic,
} from './core/sound.js';
import { setHapticsEnabled } from './core/haptics.js';
import { showOverlay, hideOverlay, toast, formatNumber } from './core/ui.js';
import { APP_VERSION } from './core/version.js';
import { UpdateManager } from './core/update.js';
import { SokobanGame } from './games/sokoban/game.js';
import { TetrisGame } from './games/tetris/game.js';
import { PlatformGame } from './games/platform/game.js';
import { LEVELS } from './games/sokoban/levels.js';

const homeScreen = document.getElementById('screen-home');
const sokobanScreen = document.getElementById('screen-sokoban');
const tetrisScreen = document.getElementById('screen-tetris');
const platformScreen = document.getElementById('screen-platform');
const sokobanProgressEl = document.getElementById('home-sokoban-progress');
const tetrisScoreEl = document.getElementById('home-tetris-score');
const platformProgressEl = document.getElementById('home-platform-progress');
const settingsButton = document.getElementById('open-settings');
const updateButton = document.getElementById('check-update');
const updateLabel = document.getElementById('update-label');
const versionEl = document.getElementById('app-version');

setSoundEnabled(state.settings.sound);
setMusicEnabled(state.settings.music);
setHapticsEnabled(state.settings.haptics);
if (versionEl) versionEl.textContent = `v${APP_VERSION}`;

let currentRoute = null;
let installPrompt = null;

const sokoban = new SokobanGame({
  onExit: () => {
    location.hash = '#/';
  },
  onProgressChange: () => refreshHome(),
});

const tetris = new TetrisGame({
  onExit: () => {
    location.hash = '#/';
  },
  onProgressChange: () => refreshHome(),
});

const platform = new PlatformGame({
  onExit: () => {
    location.hash = '#/';
  },
  onProgressChange: () => refreshHome(),
});

const updateManager = new UpdateManager({
  button: updateButton,
  label: updateLabel,
});
void updateManager;

function refreshHome() {
  const completed = sokobanCompletedCount();
  if (completed === 0) {
    sokobanProgressEl.textContent = `24 关 · 尚未开始`;
  } else if (completed >= LEVELS.length) {
    sokobanProgressEl.textContent = `全部通关 · ${completed} / ${LEVELS.length}`;
  } else {
    const next = Math.min(LEVELS.length, state.sokoban.lastLevel || 1);
    sokobanProgressEl.textContent = `已通关 ${completed} / ${LEVELS.length} · 第 ${next} 关`;
  }

  tetrisScoreEl.textContent = `最高分 ${formatNumber(state.tetris.highScore)}`;

  const platformDone = platformCompletedCount();
  if (platformDone === 0) {
    platformProgressEl.textContent = `3 关 · 尚未出发`;
  } else if (platformDone >= 3) {
    platformProgressEl.textContent = `全部通关 · ${platformDone} / 3`;
  } else {
    platformProgressEl.textContent = `已通关 ${platformDone} / 3 · 第 ${state.platform.lastLevel} 关`;
  }
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!raw) return { name: 'home' };
  const [name, param] = raw.split('/');
  if (name === 'sokoban') return { name: 'sokoban', level: Number(param) || null };
  if (name === 'tetris') return { name: 'tetris' };
  if (name === 'platform') return { name: 'platform', level: Number(param) || null };
  return { name: 'home' };
}

function showScreen(name) {
  homeScreen.hidden = name !== 'home';
  sokobanScreen.hidden = name !== 'sokoban';
  tetrisScreen.hidden = name !== 'tetris';
  platformScreen.hidden = name !== 'platform';
  document.body.classList.toggle('in-game', name !== 'home');
}

function stopAll() {
  sokoban.stop();
  tetris.stop();
  platform.stop();
}

function syncRoute() {
  const route = parseRoute();

  if (route.name === 'home') {
    if (currentRoute !== 'home') stopAll();
    showScreen('home');
    currentRoute = 'home';
    refreshHome();
    startMusic('home');
    return;
  }

  if (route.name === 'sokoban') {
    if (currentRoute === 'sokoban' && sokoban.active) {
      if (route.level) sokoban.start(route.level);
      return;
    }
    tetris.stop();
    platform.stop();
    showScreen('sokoban');
    currentRoute = 'sokoban';
    sokoban.start(route.level);
    startMusic('sokoban');
    return;
  }

  if (route.name === 'tetris') {
    if (currentRoute === 'tetris' && tetris.active) return;
    sokoban.stop();
    platform.stop();
    showScreen('tetris');
    currentRoute = 'tetris';
    tetris.start();
    startMusic('tetris');
    return;
  }

  if (route.name === 'platform') {
    if (currentRoute === 'platform' && platform.active) {
      if (route.level) platform.start(route.level);
      return;
    }
    sokoban.stop();
    tetris.stop();
    showScreen('platform');
    currentRoute = 'platform';
    platform.start(route.level);
    startMusic('platform');
  }
}

function openSettings() {
  showOverlay({
    kicker: 'SETTINGS',
    title: '设置',
    description: `进度和偏好只保存在本机 · v${APP_VERSION}`,
    dismissible: true,
    html: `
      <div class="setting-list">
        <div class="setting-row">
          <div><p>音效</p><small>跳跃、消除和过关的声音</small></div>
          <button class="switch" type="button" data-setting="sound" aria-pressed="${state.settings.sound}" aria-label="音效开关"></button>
        </div>
        <div class="setting-row">
          <div><p>背景音乐</p><small>每个游戏都有专属的原创芯片音乐</small></div>
          <button class="switch" type="button" data-setting="music" aria-pressed="${state.settings.music}" aria-label="背景音乐开关"></button>
        </div>
        <div class="setting-row">
          <div><p>震动</p><small>支持的手机会在操作时轻震</small></div>
          <button class="switch" type="button" data-setting="haptics" aria-pressed="${state.settings.haptics}" aria-label="震动开关"></button>
        </div>
        ${installPrompt ? `<button class="btn btn-primary" type="button" data-install-app>安装到桌面</button>` : ''}
        <button class="btn btn-danger" type="button" data-reset-progress>清除游戏进度</button>
      </div>
    `,
    onMount: (card) => {
      card.querySelectorAll('[data-setting]').forEach((button) => {
        button.addEventListener('click', () => {
          const key = button.dataset.setting;
          const next = button.getAttribute('aria-pressed') !== 'true';
          button.setAttribute('aria-pressed', String(next));
          setSetting(key, next);
          if (key === 'sound') {
            setSoundEnabled(next);
            if (next) {
              unlockAudio();
              playSound('rotate');
            }
          } else if (key === 'music') {
            setMusicEnabled(next);
            if (next) startMusic(currentRoute === 'home' ? 'home' : currentRoute);
          } else {
            setHapticsEnabled(next);
            if (next) navigator.vibrate?.(10);
          }
        });
      });

      card.querySelector('[data-install-app]')?.addEventListener('click', async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        try {
          await installPrompt.userChoice;
        } finally {
          installPrompt = null;
          hideOverlay();
        }
      });

      card.querySelector('[data-reset-progress]')?.addEventListener('click', () => {
        showOverlay({
          kicker: 'RESET',
          title: '清除所有进度？',
          description: '推箱子、俄罗斯方块和跳跃冒险的记录会一起清空，设置会保留。这个操作不能撤销。',
          dismissible: true,
          actions: [
            {
              label: '确认清除',
              kind: 'danger',
              onClick: () => {
                resetProgress();
                refreshHome();
                toast('进度已清除');
                openSettings();
                return false;
              },
            },
            { label: '取消' },
          ],
        });
      });
    },
  });
}

settingsButton.addEventListener('click', () => {
  unlockAudio();
  openSettings();
});

window.addEventListener('hashchange', () => {
  unlockAudio();
  syncRoute();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  toast('已安装到桌面');
});

window.addEventListener('offline', () => toast('已离线，游戏仍可继续'));
window.addEventListener('online', () => toast('网络已恢复'));

const unlockOnce = () => {
  unlockAudio();
  document.removeEventListener('pointerdown', unlockOnce);
  document.removeEventListener('keydown', unlockOnce);
};
document.addEventListener('pointerdown', unlockOnce);
document.addEventListener('keydown', unlockOnce);

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  // 本地开发辅助：方便在浏览器里检查各游戏状态，线上不会暴露。
  window.__pocketDebug = { sokoban, tetris, platform };
}

refreshHome();
showScreen('home');
syncRoute();
