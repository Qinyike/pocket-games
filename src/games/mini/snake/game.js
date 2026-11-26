import { SnakeEngine, DIRECTIONS } from './logic.js';
import { miniState, updateMini } from '../../../core/storage.js';
import { playSound, startMusic, stopMusic } from '../../../core/sound.js';
import { vibrate } from '../../../core/haptics.js';
import { showOverlay, hideOverlay, isOverlayOpen } from '../../../core/ui.js';
import { el, hudPill, button, formatScore, bindSwipe, createKeyHandler } from '../shared.js';

const KEY_TO_DIR = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
};

const DIR_ICONS = {
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export class SnakeGame {
  constructor({ stage, hud, controls, help, onExit, onProgressChange }) {
    this.stage = stage;
    this.hud = hud;
    this.controls = controls;
    this.help = help;
    this.onExit = onExit;
    this.onProgressChange = onProgressChange;
    this.engine = new SnakeEngine();
    this.best = miniState('snake').best || 0;
    this.started = false;
    this.paused = false;
    this.raf = 0;
    this.acc = 0;
    this.last = 0;
    this.cleanup = [];
  }

  start() {
    startMusic('action');
    this.help.textContent = '滑动或按方向键开始。吃到果实会变长，撞墙或撞到自己就结束。';
    this.build();
    this.bind();
    this.reset(false);
    this.loop();
  }

  build() {
    this.hud.replaceChildren(
      hudPill('分数', 0),
      hudPill('最佳', this.best),
      hudPill('速度', '1x'),
    );
    this.scorePill = this.hud.children[0].querySelector('strong');
    this.bestPill = this.hud.children[1].querySelector('strong');
    this.speedPill = this.hud.children[2].querySelector('strong');

    this.canvas = el('canvas', 'snake-canvas');
    this.canvas.setAttribute('aria-label', '贪吃蛇棋盘');
    const wrap = el('div', 'snake-wrap');
    wrap.appendChild(this.canvas);
    this.stage.replaceChildren(wrap);
    this.ctx = this.canvas.getContext('2d');

    const pad = el('div', 'mini-dpad');
    for (const dir of ['up', 'left', 'down', 'right']) {
      const btn = button('', {
        className: 'mini-dpad-btn',
        onClick: () => this.turn(dir),
        icon: DIR_ICONS[dir],
      });
      btn.dataset.dir = dir;
      btn.setAttribute('aria-label', { up: '上', down: '下', left: '左', right: '右' }[dir]);
      pad.appendChild(btn);
    }
    this.controls.replaceChildren(pad);
    this.pad = pad;
  }

  bind() {
    this.cleanup.push(
      createKeyHandler((event) => {
        if (isOverlayOpen()) return false;
        const dir = KEY_TO_DIR[event.key];
        if (dir) {
          this.turn(dir);
          return true;
        }
        if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
          this.pause();
          return true;
        }
        return false;
      }),
    );
    this.cleanup.push(bindSwipe(this.canvas, (dir) => this.turn(dir)));
    this.resize = () => this.fit();
    window.addEventListener('resize', this.resize);
    this.cleanup.push(() => window.removeEventListener('resize', this.resize));
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.stage);
    this.cleanup.push(() => this.resizeObserver.disconnect());
    this.fit();
  }

  reset(countPlay = true) {
    hideOverlay();
    this.engine.reset();
    this.started = false;
    this.paused = false;
    this.acc = 0;
    this.last = 0;
    this.updateHud();
    this.draw();
    startMusic('action');
    if (countPlay) {
      updateMini('snake', (state) => {
        state.plays += 1;
      });
    }
  }

  turn(dir) {
    if (this.paused || !this.engine.alive) return;
    if (!this.started) {
      this.started = true;
      this.last = 0;
    }
    if (this.engine.setDirection(dir)) {
      playSound('tap');
      vibrate(4);
    }
    this.draw();
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const frame = (now) => {
      if (!this.last) this.last = now;
      const delta = Math.min(100, now - this.last);
      this.last = now;
      if (this.started && !this.paused && this.engine.alive) {
        this.acc += delta;
        while (this.acc >= this.engine.speed) {
          this.acc -= this.engine.speed;
          const result = this.engine.step();
          this.updateHud();
          this.draw();
          if (result.ate) {
            playSound('coin');
            vibrate(8);
            if (this.engine.score > this.best) {
              this.best = this.engine.score;
              updateMini('snake', (state) => {
                state.best = this.best;
              });
              this.onProgressChange?.();
            }
          }
          if (!result.alive) {
            this.gameOver(result.reason);
            break;
          }
        }
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  fit() {
    if (!this.canvas) return;
    const rect = this.stage.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const size = Math.floor(Math.min(rect.width - 8, rect.height - 8, 620));
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.floor(size * dpr);
    this.canvas.height = Math.floor(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.boardSize = size;
    this.draw();
  }

  draw() {
    if (!this.ctx || !this.boardSize) return;
    const ctx = this.ctx;
    const size = this.boardSize;
    const cell = size / this.engine.size;
    ctx.clearRect(0, 0, size, size);
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#101a2b');
    bg.addColorStop(1, '#0a111d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let i = 1; i < this.engine.size; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(size, i * cell);
      ctx.stroke();
    }

    if (this.engine.food) {
      const fx = (this.engine.food.x + 0.5) * cell;
      const fy = (this.engine.food.y + 0.5) * cell;
      ctx.save();
      ctx.fillStyle = '#ff7188';
      ctx.shadowColor = 'rgba(255,113,136,0.6)';
      ctx.shadowBlur = cell * 0.8;
      ctx.beginPath();
      ctx.arc(fx, fy, cell * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#7ee08d';
      ctx.beginPath();
      ctx.ellipse(fx + cell * 0.12, fy - cell * 0.34, cell * 0.13, cell * 0.07, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    this.engine.snake.forEach((part, index) => {
      const x = part.x * cell + cell * 0.08;
      const y = part.y * cell + cell * 0.08;
      const w = cell * 0.84;
      const head = index === 0;
      ctx.fillStyle = head ? '#8df2b0' : index < 4 ? '#57d999' : '#3aa873';
      ctx.beginPath();
      ctx.roundRect(x, y, w, w, cell * (head ? 0.3 : 0.22));
      ctx.fill();
      if (head) {
        const dir = DIRECTIONS[this.engine.direction];
        ctx.fillStyle = '#0a1a10';
        const ex = x + w / 2 + dir.x * w * 0.15;
        const ey = y + w / 2 + dir.y * w * 0.15;
        const ox = dir.y * w * 0.18;
        const oy = dir.x * w * 0.18;
        ctx.beginPath();
        ctx.arc(ex - ox, ey - oy, Math.max(1.5, cell * 0.08), 0, Math.PI * 2);
        ctx.arc(ex + ox, ey + oy, Math.max(1.5, cell * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (!this.started) {
      ctx.fillStyle = 'rgba(5,10,18,0.58)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#f4f6ff';
      ctx.textAlign = 'center';
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.fillText('滑动或按方向键开始', size / 2, size / 2 - 6);
      ctx.fillStyle = 'rgba(244,246,255,0.55)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('吃到果实变长，别撞墙', size / 2, size / 2 + 16);
    }
  }

  updateHud() {
    this.scorePill.textContent = formatScore(this.engine.score);
    this.bestPill.textContent = formatScore(this.best);
    this.speedPill.textContent = `${Math.floor(this.engine.score / 50) + 1}x`;
  }

  gameOver(reason) {
    playSound('gameover');
    vibrate([20, 60, 24, 60, 60]);
    stopMusic();
    const isBest = this.engine.score > this.best;
    if (isBest) {
      this.best = this.engine.score;
      updateMini('snake', (state) => {
        state.best = this.best;
      });
      this.onProgressChange?.();
    }
    this.updateHud();
    showOverlay({
      kicker: isBest ? 'NEW BEST' : 'GAME OVER',
      title: reason === 'wall' ? '撞到墙了' : '撞到自己了',
      theme: 'mini-theme',
      description: isBest ? '刷新了最高分。' : '再试一次，保持节奏。',
      stats: [
        ['分数', formatScore(this.engine.score)],
        ['最佳', formatScore(this.best)],
        ['长度', String(this.engine.snake.length)],
      ],
      dismissible: false,
      actions: [
        { label: '再来一局', kind: 'primary', onClick: () => this.reset(true) },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  pause() {
    if (!this.started || this.paused || !this.engine.alive || isOverlayOpen()) return;
    this.paused = true;
    stopMusic();
    showOverlay({
      kicker: 'PAUSED',
      title: '暂停一下',
      theme: 'mini-theme',
      stats: [
        ['分数', formatScore(this.engine.score)],
        ['最佳', formatScore(this.best)],
        ['长度', String(this.engine.snake.length)],
      ],
      dismissible: false,
      actions: [
        { label: '继续', kind: 'primary', onClick: () => this.resume() },
        { label: '重新开始', onClick: () => this.reset(true) },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  resume() {
    hideOverlay();
    this.paused = false;
    this.last = 0;
    startMusic('action');
  }

  restart() {
    this.reset(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    stopMusic();
    hideOverlay();
  }
}
