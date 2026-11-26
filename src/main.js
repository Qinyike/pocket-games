import {
  state,
  setSetting,
  resetProgress,
  sokobanCompletedCount,
} from './core/storage.js';
import { setSoundEnabled, unlockAudio, playSound } from './core/sound.js';
import { setHapticsEnabled } from './core/haptics.js';
import { showOverlay, hideOverlay, toast, formatNumber } from './core/ui.js';
import { SokobanGame } from './games/sokoban/game.js';
import { TetrisGame } from './games/tetris/game.js';
import { LEVELS } from './games/sokoban/levels.js';

const homeScreen = document.getElementById('screen-home');
const sokobanScreen = document.getElementById('screen-sokoban');
const tetrisScreen = document.getElementById('screen-tetris');
const sokobanProgressEl = document.getElementById('home-sokoban-progress');
const tetrisScoreEl = document.getElementById('home-tetris-score');
const settingsButton = document.getElementById('open-settings');

setSoundEnabled(state.settings.sound);
setHapticsEnabled(state.settings.haptics);

let currentRoute = 'home';
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
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!raw) return { name: 'home' };
  const [name, param] = raw.split('/');
  if (name === 'sokoban') return { name: 'sokoban', level: Number(param) || null };
  if (name === 'tetris') return { name: 'tetris' };
  return { name: 'home' };
}

function showScreen(name) {
  homeScreen.hidden = name !== 'home';
  sokobanScreen.hidden = name !== 'sokoban';
  tetrisScreen.hidden = name !== 'tetris';
  document.body.classList.toggle('in-game', name !== 'home');
}

function syncRoute() {
  const route = parseRoute();
  if (route.name === currentRoute && route.name !== 'sokoban') {
    if (route.name === 'tetris' && !tetris.active) {
      showScreen('tetris');
      tetris.start();
    }
    return;
  }

  if (route.name === 'sokoban') {
    tetris.stop();
    showScreen('sokoban');
    currentRoute = 'sokoban';
    sokoban.start(route.level);
  } else if (route.name === 'tetris') {
    sokoban.stop();
    showScreen('tetris');
    currentRoute = 'tetris';
    tetris.start();
  } else {
    sokoban.stop();
    tetris.stop();
    showScreen('home');
    currentRoute = 'home';
    refreshHome();
  }
}

function openSettings() {
  showOverlay({
    kicker: 'SETTINGS',
    title: '设置',
    description: '所有进度和偏好都只保存在这台设备上。',
    dismissible: true,
    html: `
      <div class="setting-list">
        <div class="setting-row">
          <div><p>音效</p><small>移动、消除和过关的声音</small></div>
          <button class="switch" type="button" data-setting="sound" aria-pressed="${state.settings.sound}" aria-label="音效开关"></button>
        </div>
        <div class="setting-row">
          <div><p>震动</p><small>支持的手机会在操作时轻震</small></div>
          <button class="switch" type="button" data-setting="haptics" aria-pressed="${state.settings.haptics}" aria-label="震动开关"></button>
        </div>
        ${
          installPrompt
            ? `<button class="btn btn-primary" type="button" data-install-app>安装到桌面</button>`
            : ''
        }
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
          description: '推箱子的通关记录和俄罗斯方块的最高分会一起清空，设置会保留。这个操作不能撤销。',
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

refreshHome();
showScreen('home');
syncRoute();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 本地开发或某些浏览器不支持时静默跳过。
    });
  });
}
