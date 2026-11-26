import { MINI_GAMES, createMiniGame } from './registry.js';
import { startMusic, stopMusic } from '../../core/sound.js';
import { hideOverlay } from '../../core/ui.js';

/**
 * 七款小游戏共用的外壳：动态标题、HUD、舞台、控制区。
 */
export class MiniScreen {
  constructor({ onExit, onProgressChange }) {
    this.onExit = onExit;
    this.onProgressChange = onProgressChange;
    this.screen = document.getElementById('screen-mini');
    this.title = document.getElementById('mini-title');
    this.subtitle = document.getElementById('mini-subtitle');
    this.hud = document.getElementById('mini-hud');
    this.stage = document.getElementById('mini-stage');
    this.help = document.getElementById('mini-help');
    this.controls = document.getElementById('mini-controls');
    this.restartBtn = document.getElementById('mini-restart');
    this.pauseBtn = document.getElementById('mini-pause');
    this.game = null;
    this.key = null;

    this.screen.querySelector('[data-mini-action="home"]')?.addEventListener('click', () => this.onExit());
    this.restartBtn.addEventListener('click', () => this.game?.restart?.());
    this.pauseBtn.addEventListener('click', () => this.game?.pause?.());
  }

  open(key) {
    const meta = MINI_GAMES[key];
    if (!meta) return;
    this.stop();
    this.key = key;
    this.title.textContent = meta.title;
    this.subtitle.textContent = meta.subtitle;
    this.pauseBtn.hidden = !meta.realTime;
    this.stage.replaceChildren();
    this.hud.replaceChildren();
    this.controls.replaceChildren();
    this.help.textContent = '';
    this.game = createMiniGame(key, {
      stage: this.stage,
      hud: this.hud,
      controls: this.controls,
      help: this.help,
      setSubtitle: (text) => {
        this.subtitle.textContent = text;
      },
      onExit: this.onExit,
      onProgressChange: this.onProgressChange,
    });
    this.game?.start();
    startMusic(meta.track || 'puzzle');
  }

  stop() {
    this.game?.destroy?.();
    this.game = null;
    this.key = null;
    hideOverlay();
    stopMusic();
    this.stage.replaceChildren();
    this.hud.replaceChildren();
    this.controls.replaceChildren();
    this.help.textContent = '';
  }

  restart() {
    this.game?.restart?.();
  }

  pause() {
    this.game?.pause?.();
  }
}
