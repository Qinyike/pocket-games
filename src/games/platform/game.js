import { PLATFORM_LEVELS } from './levels.js';
import { PlatformEngine, THEMES } from './engine.js';
import {
  state as progress,
  completePlatformLevel,
  platformBest,
  platformCompletedCount,
  setPlatformLastLevel,
} from '../../core/storage.js';
import { playSound, startMusic, stopMusic } from '../../core/sound.js';
import { vibrate } from '../../core/haptics.js';
import { showOverlay, hideOverlay, toast, isOverlayOpen } from '../../core/ui.js';

const FIXED_DT = 1 / 120;
const MAX_FRAME = 0.05;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export class PlatformGame {
  constructor({ onExit, onProgressChange } = {}) {
    this.onExit = onExit || (() => {});
    this.onProgressChange = onProgressChange || (() => {});
    this.active = false;
    this.paused = false;
    this.won = false;
    this.over = false;
    this.engine = null;
    this.level = null;
    this.raf = 0;
    this.lastTime = 0;
    this.accumulator = 0;
    this.time = 0;
    this.cell = 30;
    this.viewW = 12;
    this.viewH = 15;
    this.camera = { x: 0, y: 0, initialized: false };
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.lastHud = {};
    this.levelIndex = 0;
    this.endTimer = 0;
    this.keys = { left: false, right: false, jump: false };
    this.touch = { left: false, right: false, jump: false };

    this.screen = document.getElementById('screen-platform');
    this.stage = document.getElementById('platform-stage');
    this.canvas = document.getElementById('platform-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.heartsEl = document.getElementById('platform-hearts');
    this.coinsEl = document.getElementById('platform-coins');
    this.timeEl = document.getElementById('platform-time');
    this.nameEl = document.getElementById('platform-level-name');
    this.hintEl = document.getElementById('platform-hint');
    this.pauseBtn = document.getElementById('platform-pause');
    this.levelsBtn = document.getElementById('platform-levels');

    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleKeyup = this.handleKeyup.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.bind();
  }

  bind() {
    this.screen.querySelectorAll('[data-action="home"]').forEach((button) => {
      button.addEventListener('click', () => this.onExit());
    });
    this.pauseBtn.addEventListener('click', () => this.pauseGame());
    this.levelsBtn.addEventListener('click', () => this.openLevelSelect());

    this.screen.querySelectorAll('[data-platform]').forEach((button) => {
      const action = button.dataset.platform;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.classList.add('is-pressed');
        if (action === 'jump') this.touch.jump = true;
        else this.touch[action] = true;
      });
      const release = () => {
        button.classList.remove('is-pressed');
        if (action === 'jump') this.touch.jump = false;
        else this.touch[action] = false;
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.stage);
  }

  start(levelId) {
    window.clearTimeout(this.endTimer);
    hideOverlay();
    this.active = true;
    this.paused = false;
    this.won = false;
    this.over = false;
    this.keys = { left: false, right: false, jump: false };
    this.touch = { left: false, right: false, jump: false };
    this.lastHud = {};
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.time = 0;
    this.accumulator = 0;
    this.lastTime = 0;

    const requested = Number(levelId);
    const index = PLATFORM_LEVELS.findIndex((level) => level.id === requested);
    const fallback = Math.max(0, (progress.platform.lastLevel || 1) - 1);
    this.loadLevel(PLATFORM_LEVELS[index >= 0 ? index : fallback]);

    document.addEventListener('keydown', this.handleKeydown);
    document.addEventListener('keyup', this.handleKeyup);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    startMusic('platform');
    this.handleResize();
    this.syncHud(true);
    this.startLoop();
  }

  stop() {
    this.active = false;
    this.paused = false;
    this.keys = { left: false, right: false, jump: false };
    this.touch = { left: false, right: false, jump: false };
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.clearTimeout(this.endTimer);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('keyup', this.handleKeyup);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    stopMusic();
    if (isOverlayOpen()) hideOverlay();
  }

  loadLevel(definition) {
    this.levelIndex = PLATFORM_LEVELS.findIndex((level) => level.id === definition.id);
    if (this.levelIndex < 0) this.levelIndex = 0;
    this.engine = new PlatformEngine(PLATFORM_LEVELS[this.levelIndex]);
    this.level = this.engine.level;
    this.won = false;
    this.over = false;
    this.paused = false;
    this.camera = { x: 0, y: 0, initialized: false };
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.nameEl.textContent = `第 ${this.level.id} 关 · ${this.level.name}`;
    this.hintEl.textContent = this.level.hint;
    setPlatformLastLevel(this.level.id);
    if (window.location.hash !== `#/platform/${this.level.id}`) {
      history.replaceState(null, '', `#/platform/${this.level.id}`);
    }
    this.syncHud(true);
    this.handleResize();
  }

  startLoop() {
    cancelAnimationFrame(this.raf);
    this.lastTime = 0;
    const loop = (now) => {
      if (!this.active) return;
      if (!this.lastTime) this.lastTime = now;
      const delta = Math.min(MAX_FRAME, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.time += delta;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - delta);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - delta);
      if (!this.paused && !this.won && !this.over && !isOverlayOpen()) {
        this.accumulator += delta;
        let steps = 0;
        while (this.accumulator >= FIXED_DT && steps < 8) {
          this.accumulator -= FIXED_DT;
          steps += 1;
          this.step();
        }
      }
      this.updateParticles(delta);
      this.render(delta);
      this.syncHud();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  step() {
    if (!this.engine || this.engine.won || this.engine.gameOver) return;
    const input = {
      left: this.keys.left || this.touch.left,
      right: this.keys.right || this.touch.right,
      jump: this.keys.jump || this.touch.jump,
    };
    const events = this.engine.step(FIXED_DT, input);
    for (const event of events) this.handleEvent(event);
    if (this.engine.won) this.handleWin();
    else if (this.engine.gameOver) this.handleGameOver();
  }

  handleEvent(event) {
    if (event.type === 'jump') {
      playSound('jump');
      vibrate(4);
    } else if (event.type === 'coin') {
      playSound('coin');
      this.spawnBurst(event.x, event.y, '#ffd45c', 7);
    } else if (event.type === 'stomp') {
      playSound('stomp');
      vibrate(10);
      this.spawnBurst(event.x + 0.35, event.y + 0.25, '#7ee08d', 10);
      this.shake = 0.1;
    } else if (event.type === 'hurt') {
      playSound('hurt');
      vibrate([16, 40, 18]);
      this.flash = 0.22;
      this.shake = 0.22;
    } else if (event.type === 'fall') {
      playSound('fall');
      this.flash = 0.24;
      this.shake = 0.3;
    } else if (event.type === 'checkpoint') {
      playSound('checkpoint');
      toast('检查点已记录');
      this.spawnBurst(
        this.level.checkpoint.col + 0.5,
        this.level.checkpoint.row + 0.3,
        '#62e6ff',
        10,
      );
    } else if (event.type === 'win') {
      this.handleWin();
    } else if (event.type === 'gameover') {
      this.handleGameOver();
    }
  }

  spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        life: 0.4 + Math.random() * 0.35,
        maxLife: 0.75,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 12 * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  syncHud(force = false) {
    if (!this.engine) return;
    const hearts = this.engine.hearts;
    const coins = `${this.engine.coins}/${this.engine.totalCoins}`;
    const time = formatTime(this.engine.elapsed);
    if (force || this.lastHud.hearts !== hearts) {
      this.heartsEl.innerHTML = Array.from(
        { length: 3 },
        (_, index) => `<span class="heart ${index < hearts ? 'is-full' : 'is-empty'}">♥</span>`,
      ).join('');
      this.lastHud.hearts = hearts;
    }
    if (force || this.lastHud.coins !== coins) {
      this.coinsEl.textContent = coins;
      this.lastHud.coins = coins;
    }
    if (force || this.lastHud.time !== time) {
      this.timeEl.textContent = time;
      this.lastHud.time = time;
    }
  }

  handleWin() {
    if (this.won) return;
    this.won = true;
    this.keys = { left: false, right: false, jump: false };
    this.touch = { left: false, right: false, jump: false };
    stopMusic();
    playSound('win');
    vibrate([18, 50, 24, 50, 40]);
    this.spawnBurst(
      this.engine.player.x + 0.3,
      this.engine.player.y,
      '#62e6ff',
      24,
    );
    const result = completePlatformLevel(
      this.level.id,
      this.engine.coins,
      this.engine.totalCoins,
      this.engine.elapsed,
    );
    this.syncHud(true);
    this.onProgressChange();

    this.endTimer = window.setTimeout(() => {
      if (!this.active) return;
      const next = PLATFORM_LEVELS[this.levelIndex + 1];
      const isLast = !next;
      const best = platformBest(this.level.id);
      const actions = [];
      if (next) {
        actions.push({
          label: `下一关 · ${next.name}`,
          kind: 'primary',
          onClick: () => this.nextLevel(next),
        });
      } else {
        actions.push({
          label: '回到第一关',
          kind: 'primary',
          onClick: () => this.nextLevel(PLATFORM_LEVELS[0]),
        });
      }
      actions.push({ label: '再玩一次', onClick: () => this.nextLevel(PLATFORM_LEVELS[this.levelIndex]) });
      actions.push({ label: '返回大厅', onClick: () => this.onExit() });

      showOverlay({
        kicker: isLast ? 'ADVENTURE CLEAR' : 'STAGE CLEAR',
        title: isLast ? '冒险完成！' : `第 ${this.level.id} 关完成`,
        description: result.newBest
          ? result.firstClear
            ? '第一次抵达终点，最佳时间已记录。'
            : '刷新了本关最佳时间，跑得漂亮。'
          : '水晶已点亮。换个路线，也许还能更快。',
        theme: 'platform-theme',
        dismissible: false,
        stats: [
          ['金币', `${this.engine.coins} / ${this.engine.totalCoins}`],
          ['用时', formatTime(this.engine.elapsed)],
          ['最佳', best ? formatTime(best.time) : formatTime(this.engine.elapsed)],
        ],
        actions,
      });
    }, 700);
  }

  nextLevel(definition) {
    hideOverlay();
    this.loadLevel(definition);
    this.resumeMusic();
    this.lastTime = 0;
    this.accumulator = 0;
  }

  handleGameOver() {
    if (this.over) return;
    this.over = true;
    this.keys = { left: false, right: false, jump: false };
    this.touch = { left: false, right: false, jump: false };
    stopMusic();
    playSound('gameover');
    vibrate([20, 60, 20, 60, 60]);
    this.syncHud(true);
    this.endTimer = window.setTimeout(() => {
      if (!this.active) return;
      showOverlay({
        kicker: 'GAME OVER',
        title: '这次差一点',
        description: '水晶还在终点等你。调整节奏，再来一次。',
        theme: 'platform-theme',
        stats: [
          ['金币', `${this.engine.coins} / ${this.engine.totalCoins}`],
          ['用时', formatTime(this.engine.elapsed)],
          ['生命', '0'],
        ],
        dismissible: false,
        actions: [
          { label: '重新挑战', kind: 'primary', onClick: () => this.restart() },
          { label: '返回大厅', onClick: () => this.onExit() },
        ],
      });
    }, 500);
  }

  pauseGame(auto = false) {
    if (!this.active || this.paused || this.won || this.over || isOverlayOpen()) return;
    this.paused = true;
    this.keys = { left: false, right: false, jump: false };
    this.touch = { left: false, right: false, jump: false };
    stopMusic();
    playSound('pause');
    showOverlay({
      kicker: auto ? 'AUTO PAUSED' : 'PAUSED',
      title: auto ? '已自动暂停' : '暂停一下',
      description: '探险会在这里等你。',
      theme: 'platform-theme',
      stats: [
        ['生命', `${this.engine.hearts} / 3`],
        ['金币', `${this.engine.coins} / ${this.engine.totalCoins}`],
        ['用时', formatTime(this.engine.elapsed)],
      ],
      dismissible: false,
      actions: [
        { label: '继续冒险', kind: 'primary', onClick: () => this.resumeGame() },
        { label: '重新开始', onClick: () => this.restart() },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  resumeGame() {
    if (!this.active || !this.paused) return;
    hideOverlay();
    this.paused = false;
    this.lastTime = 0;
    this.resumeMusic();
    playSound('pause');
  }

  restart() {
    window.clearTimeout(this.endTimer);
    hideOverlay();
    this.engine.reset();
    this.won = false;
    this.over = false;
    this.paused = false;
    this.camera = { x: 0, y: 0, initialized: false };
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.accumulator = 0;
    this.lastTime = 0;
    this.keys = { left: false, right: false, jump: false };
    this.touch = { left: false, right: false, jump: false };
    this.lastHud = {};
    this.syncHud(true);
    this.resumeMusic();
  }

  resumeMusic() {
    startMusic('platform');
  }

  openLevelSelect() {
    if (!this.active) return;
    this.keys = { left: false, right: false, jump: false };
    this.touch = { left: false, right: false, jump: false };
    window.clearTimeout(this.endTimer);
    const completed = platformCompletedCount();
    const buttons = PLATFORM_LEVELS.map((level) => {
      const best = platformBest(level.id);
      const classes = [
        'level-btn',
        best ? 'is-done' : '',
        level.id === this.level?.id ? 'is-current' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${classes}" type="button" data-platform-level="${level.id}" aria-label="第 ${level.id} 关 ${level.name}${best ? '，已通关' : ''}">
          ${level.id}
          <small>${best ? formatTime(best.time) : '未通关'}</small>
        </button>
      `;
    }).join('');

    showOverlay({
      kicker: 'STAGE SELECT',
      title: '选择关卡',
      description: `已通关 ${completed} / ${PLATFORM_LEVELS.length} 关。三个关卡都已解锁。`,
      theme: 'platform-theme',
      html: `<div class="level-grid">${buttons}</div>`,
      dismissible: true,
      onMount: (card) => {
        card.querySelectorAll('[data-platform-level]').forEach((button) => {
          button.addEventListener('click', () => {
            const level = PLATFORM_LEVELS.find((item) => item.id === Number(button.dataset.platformLevel));
            if (!level) return;
            hideOverlay();
            this.loadLevel(level);
            this.resumeMusic();
            this.lastTime = 0;
            this.accumulator = 0;
          });
        });
      },
    });
  }

  handleKeydown(event) {
    if (!this.active || isOverlayOpen()) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      this.keys.left = true;
    } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      event.preventDefault();
      this.keys.right = true;
    } else if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
      event.preventDefault();
      this.keys.jump = true;
    } else if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) this.pauseGame();
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      if (!event.repeat) this.restart();
    }
  }

  handleKeyup(event) {
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      this.keys.left = false;
    } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      this.keys.right = false;
    } else if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
      this.keys.jump = false;
    }
  }

  handleVisibility() {
    if (!this.active) return;
    if (document.hidden && !this.paused && !this.won && !this.over) this.pauseGame(true);
  }

  handleResize() {
    if (!this.active || !this.stage) return;
    const rect = this.stage.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const targetRows = rect.height > rect.width ? 15 : 10;
    this.cell = Math.max(18, Math.min(rect.width / 9, rect.height / targetRows, 56));
    this.viewW = rect.width / this.cell;
    this.viewH = rect.height / this.cell;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.initialized = false;
    if (this.engine) this.render(0);
  }

  get theme() {
    return THEMES[this.level?.theme] || THEMES.day;
  }

  updateCamera() {
    if (!this.engine) return;
    const maxX = Math.max(0, this.level.width - this.viewW);
    let target = this.engine.player.x + this.engine.player.width / 2 - this.viewW * 0.38;
    if (this.level.width <= this.viewW) {
      target = (this.level.width - this.viewW) / 2;
    }
    target = clamp(target, 0, maxX);
    if (!this.camera.initialized) {
      this.camera.x = target;
      this.camera.initialized = true;
    } else {
      this.camera.x += (target - this.camera.x) * 0.16;
    }
    // 竖屏会看到大量天空；把镜头上移一点，底部补一层剖面泥土。
    const cropTop = Math.max(0, Math.min(2.5, this.viewH - 11));
    this.camera.y = this.level.height - this.viewH + cropTop;
  }

  render() {
    if (!this.engine) return;
    this.updateCamera();
    const ctx = this.ctx;
    const { cell } = this;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const theme = this.theme;
    // canvas.width 已按 DPR 放大，但 setTransform 后使用 CSS 像素坐标。
    const cssWidth = parseInt(this.canvas.style.width, 10) || width;
    const cssHeight = parseInt(this.canvas.style.height, 10) || height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    const sky = ctx.createLinearGradient(0, 0, 0, cssHeight);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    this.drawBackdrop(ctx, cssWidth, cssHeight);

    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * cell * 0.8 : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * cell * 0.8 : 0;

    ctx.save();
    ctx.translate(-this.camera.x * cell + shakeX, -this.camera.y * cell + shakeY);

    const startCol = Math.max(0, Math.floor(this.camera.x) - 1);
    const endCol = Math.min(this.level.width - 1, Math.ceil(this.camera.x + this.viewW) + 1);
    for (let row = 0; row < this.level.height; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        this.drawTile(ctx, col, row);
      }
    }

    this.drawUnderground(ctx, startCol, endCol);

    for (const enemy of this.engine.enemyState) {
      if (!enemy.alive) continue;
      this.drawEnemy(ctx, enemy);
    }
    this.drawPlayer(ctx);
    this.drawParticles(ctx);

    ctx.restore();

    if (this.flash > 0) {
      const vignette = ctx.createRadialGradient(
        cssWidth / 2,
        cssHeight / 2,
        Math.min(cssWidth, cssHeight) * 0.18,
        cssWidth / 2,
        cssHeight / 2,
        Math.max(cssWidth, cssHeight) * 0.72,
      );
      vignette.addColorStop(0, 'rgba(255, 90, 90, 0)');
      vignette.addColorStop(1, `rgba(255, 72, 82, ${Math.min(0.5, this.flash * 1.6)})`);
      ctx.save();
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
      ctx.restore();
    }
  }

  drawUnderground(ctx, startCol, endCol) {
    const worldBottom = this.camera.y + this.viewH;
    if (worldBottom <= this.level.height) return;
    const { cell } = this;
    const x = startCol * cell;
    const width = (endCol - startCol + 1) * cell;
    const y = this.level.height * cell;
    const height = (worldBottom - this.level.height) * cell + 2;
    const theme = this.theme;
    const grad = ctx.createLinearGradient(0, y, 0, y + height);
    grad.addColorStop(0, theme.groundDark);
    grad.addColorStop(1, '#20160f');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#120c08';
    ctx.lineWidth = 2;
    for (let row = 0; row < Math.ceil(height / cell); row += 1) {
      const lineY = y + row * cell;
      ctx.beginPath();
      ctx.moveTo(x, lineY);
      ctx.lineTo(x + width, lineY);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBackdrop(ctx, width, height) {
    const theme = this.theme;
    const night = this.level.theme === 'night';
    const parallax = this.camera.x * this.cell;

    // 太阳 / 月亮
    const orbX = width * 0.78 - ((parallax * 0.02) % (width * 1.4));
    const orbY = Math.max(46, height * 0.14);
    ctx.save();
    ctx.globalAlpha = night ? 0.78 : 0.9;
    ctx.fillStyle = night ? '#e8e4c7' : '#fff3c4';
    ctx.shadowColor = night ? 'rgba(220,230,255,0.75)' : 'rgba(255,223,130,0.85)';
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.arc(orbX, orbY, Math.max(18, height * 0.035), 0, Math.PI * 2);
    ctx.fill();
    if (night) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(orbX + 10, orbY - 5, Math.max(16, height * 0.033), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    if (night) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 34; i += 1) {
        const x = ((i * 137.3) % width + width - ((parallax * 0.01) % width)) % width;
        const y = ((i * 53.7) % (height * 0.55)) + 8;
        const size = i % 5 === 0 ? 1.8 : 1;
        ctx.globalAlpha = 0.35 + ((i * 7) % 10) / 20;
        ctx.fillRect(x, y, size, size);
      }
      ctx.restore();
    }

    // 远处山丘
    this.drawHills(ctx, width, height, theme.hillFar, 0.16, height * 0.55, height * 0.12);
    this.drawHills(ctx, width, height, theme.hillNear, 0.3, height * 0.68, height * 0.17);

    // 云：分几层铺满上方，让竖屏的大片天空不显得空。
    const cloudCount = 9;
    for (let i = 0; i < cloudCount; i += 1) {
      const baseX = ((i * 190 + 40 - parallax * (0.06 + (i % 3) * 0.02)) % (width + 300)) - 150;
      const y = height * (0.1 + (i % 5) * 0.085);
      const scale = 0.65 + (i % 3) * 0.2;
      ctx.save();
      ctx.globalAlpha = (night ? 0.12 : 0.45) + (i % 3) * 0.09;
      ctx.fillStyle = theme.cloud;
      ctx.beginPath();
      ctx.ellipse(baseX, y, 34 * scale, 12 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(baseX - 22 * scale, y + 4 * scale, 21 * scale, 8 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(baseX + 24 * scale, y + 3 * scale, 23 * scale, 9 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 远处的小鸟
    if (!night) {
      ctx.save();
      ctx.strokeStyle = 'rgba(45, 92, 116, 0.42)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i += 1) {
        const bx = ((i * 173 + 210 + this.time * (6 + i)) - parallax * 0.04) % (width + 120) - 60;
        const by = height * (0.26 + (i % 2) * 0.07) + Math.sin(this.time * 1.4 + i) * 4;
        const flap = Math.sin(this.time * 5 + i * 2) * 4;
        ctx.beginPath();
        ctx.moveTo(bx - 6, by + flap);
        ctx.quadraticCurveTo(bx - 2, by - 3, bx, by);
        ctx.quadraticCurveTo(bx + 2, by - 3, bx + 6, by + flap);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 缓慢漂浮的热气球（原创装饰）
    const balloonX = ((width * 0.22 - parallax * 0.05 + this.time * 2) % (width + 180)) - 90;
    const balloonY = height * 0.35 + Math.sin(this.time * 0.6) * 5;
    ctx.save();
    ctx.globalAlpha = night ? 0.42 : 0.7;
    ctx.strokeStyle = night ? '#c7d3ff' : '#376b7a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(balloonX - 7, balloonY + 17);
    ctx.lineTo(balloonX - 3, balloonY + 28);
    ctx.moveTo(balloonX + 7, balloonY + 17);
    ctx.lineTo(balloonX + 3, balloonY + 28);
    ctx.stroke();
    ctx.fillStyle = night ? '#7c8ac4' : '#ff8d6e';
    ctx.beginPath();
    ctx.ellipse(balloonX, balloonY, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = night ? '#5a679c' : '#ffd45c';
    ctx.fillRect(balloonX - 12, balloonY - 1, 24, 5);
    ctx.fillStyle = night ? '#424b78' : '#8d5a37';
    ctx.fillRect(balloonX - 5, balloonY + 27, 10, 6);
    ctx.restore();
  }

  drawHills(ctx, width, height, color, speed, baseY, amplitude) {
    const offset = this.camera.x * this.cell * speed;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width + 40; x += 40) {
      const y = baseY + Math.sin((x + offset) / 150) * amplitude * 0.45 + Math.sin((x + offset) / 61) * amplitude * 0.2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawTile(ctx, col, row) {
    const ch = this.level.grid[row][col];
    const { cell } = this;
    const x = col * cell;
    const y = row * cell;
    const theme = this.theme;

    if (ch === '#') {
      const above = row > 0 ? this.level.grid[row - 1][col] : ' ';
      const top = above !== '#';
      ctx.fillStyle = theme.ground;
      ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
      ctx.fillStyle = theme.groundDark;
      ctx.fillRect(x + 2, y + cell * 0.42, cell - 4, 2);
      if (top) {
        ctx.fillStyle = theme.grass;
        ctx.fillRect(x, y, cell + 0.5, Math.max(4, cell * 0.24));
        ctx.fillStyle = theme.grassDark;
        ctx.fillRect(x, y + Math.max(4, cell * 0.24) - 2, cell + 0.5, 2);
        for (let i = 0; i < 3; i += 1) {
          const bx = x + ((i * 37 + col * 13) % Math.max(1, cell - 6)) + 3;
          ctx.fillStyle = theme.grassDark;
          ctx.fillRect(bx, y - 2 + (i % 2) * 2, 2, 4);
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell, cell);
      return;
    }

    if (ch === '=') {
      ctx.fillStyle = theme.platformDark;
      ctx.fillRect(x + 2, y + cell * 0.18, cell - 4, cell * 0.3);
      ctx.fillStyle = theme.platform;
      ctx.fillRect(x + 2, y + cell * 0.1, cell - 4, cell * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 5, y + cell * 0.28, cell - 10, 2);
      return;
    }

    if (ch === '^') {
      ctx.fillStyle = theme.stoneDark;
      ctx.fillRect(x + 2, y + cell * 0.72, cell - 4, cell * 0.2);
      ctx.fillStyle = '#dbe7ff';
      for (let i = 0; i < 3; i += 1) {
        const sx = x + cell * (0.18 + i * 0.24);
        ctx.beginPath();
        ctx.moveTo(sx, y + cell * 0.82);
        ctx.lineTo(sx + cell * 0.16, y + cell * 0.3);
        ctx.lineTo(sx + cell * 0.32, y + cell * 0.82);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    if (ch === 'o') {
      const coin = this.engine.coinState.find((item) => item.col === col && item.row === row);
      if (coin?.collected) return;
      const cx = x + cell / 2;
      const cy = y + cell / 2 + Math.sin(this.time * 3 + col) * cell * 0.04;
      const spin = 0.35 + Math.abs(Math.cos(this.time * 3.2 + col)) * 0.65;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(spin, 1);
      ctx.fillStyle = '#ffcf4d';
      ctx.shadowColor = 'rgba(255,196,50,0.7)';
      ctx.shadowBlur = cell * 0.25;
      ctx.beginPath();
      ctx.arc(0, 0, cell * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#e79b1f';
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, cell * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff1a8';
      ctx.beginPath();
      ctx.arc(-cell * 0.06, -cell * 0.06, cell * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (ch === 'G') {
      this.drawGoal(ctx, x, y);
      return;
    }

    if (ch === 'C') {
      this.drawCheckpoint(ctx, x, y);
    }
  }

  drawGoal(ctx, x, y) {
    const { cell } = this;
    ctx.save();
    ctx.fillStyle = this.theme.stoneDark;
    ctx.fillRect(x + cell * 0.18, y + cell * 0.65, cell * 0.64, cell * 0.3);
    ctx.fillStyle = this.theme.stone;
    ctx.fillRect(x + cell * 0.22, y + cell * 0.6, cell * 0.56, cell * 0.12);
    const pulse = 0.75 + Math.sin(this.time * 4) * 0.15;
    ctx.translate(x + cell * 0.5, y + cell * 0.42);
    ctx.shadowColor = `rgba(98,230,255,${0.7 * pulse})`;
    ctx.shadowBlur = cell * 0.5;
    ctx.fillStyle = '#8df2ff';
    ctx.beginPath();
    ctx.moveTo(0, -cell * 0.52);
    ctx.lineTo(cell * 0.24, -cell * 0.1);
    ctx.lineTo(0, cell * 0.38);
    ctx.lineTo(-cell * 0.24, -cell * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.76)';
    ctx.beginPath();
    ctx.moveTo(0, -cell * 0.42);
    ctx.lineTo(cell * 0.12, -cell * 0.08);
    ctx.lineTo(0, cell * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawCheckpoint(ctx, x, y) {
    const { cell } = this;
    const active = this.engine.checkpointActive;
    ctx.save();
    ctx.strokeStyle = active ? '#7ef4ff' : '#d7e0f6';
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + cell * 0.32, y + cell * 0.9);
    ctx.lineTo(x + cell * 0.32, y + cell * 0.15);
    ctx.stroke();
    ctx.fillStyle = active ? '#62e6ff' : '#ffb454';
    ctx.beginPath();
    ctx.moveTo(x + cell * 0.35, y + cell * 0.18);
    ctx.lineTo(x + cell * 0.85, y + cell * 0.34);
    ctx.lineTo(x + cell * 0.35, y + cell * 0.5);
    ctx.closePath();
    ctx.fill();
    if (active) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#62e6ff';
      ctx.beginPath();
      ctx.arc(x + cell * 0.32, y + cell * 0.15, cell * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawEnemy(ctx, enemy) {
    const { cell } = this;
    const x = enemy.x * cell;
    const y = enemy.y * cell;
    const w = enemy.width * cell;
    const h = enemy.height * cell;
    const bounce = Math.sin(this.time * 7 + enemy.x) * 0.05;
    ctx.save();
    ctx.translate(x + w / 2, y + h);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 2, w * 0.42, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5fd37a';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.45 + bounce * h, w * 0.48, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3ba75a';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.25, w * 0.44, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12251a';
    ctx.beginPath();
    ctx.arc(-w * 0.16, -h * 0.58, Math.max(1.8, w * 0.08), 0, Math.PI * 2);
    ctx.arc(w * 0.16, -h * 0.58, Math.max(1.8, w * 0.08), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eaffef';
    ctx.beginPath();
    ctx.arc(-w * 0.13, -h * 0.62, Math.max(0.6, w * 0.025), 0, Math.PI * 2);
    ctx.arc(w * 0.19, -h * 0.62, Math.max(0.6, w * 0.025), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPlayer(ctx) {
    const { cell } = this;
    const p = this.engine.player;
    const x = p.x * cell;
    const y = p.y * cell;
    const w = p.width * cell;
    const h = p.height * cell;
    const theme = this.theme;

    if (this.engine.invincible > 0 && Math.floor(this.time * 16) % 2 === 0) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 1, w * 0.38, Math.max(2, h * 0.06), 0, 0, Math.PI * 2);
    ctx.fill();

    const run = this.engine.grounded && Math.abs(this.engine.vx) > 0.4;
    const swing = run ? Math.sin(this.time * 22) * 0.08 * h : 0;
    ctx.translate(x + w / 2, y + h);
    if (this.engine.facing < 0) ctx.scale(-1, 1);

    // 腿
    ctx.fillStyle = '#26344f';
    roundedRect(ctx, -w * 0.32 + swing, -h * 0.28, w * 0.25, h * 0.28, w * 0.08);
    ctx.fill();
    roundedRect(ctx, w * 0.07 - swing, -h * 0.28, w * 0.25, h * 0.28, w * 0.08);
    ctx.fill();

    // 身体
    ctx.fillStyle = '#e9874b';
    roundedRect(ctx, -w * 0.36, -h * 0.72, w * 0.72, h * 0.48, w * 0.16);
    ctx.fill();
    ctx.fillStyle = '#c96b35';
    roundedRect(ctx, -w * 0.36, -h * 0.38, w * 0.72, h * 0.1, w * 0.05);
    ctx.fill();

    // 围巾
    ctx.fillStyle = '#3fb9b0';
    roundedRect(ctx, -w * 0.42, -h * 0.76, w * 0.84, h * 0.12, w * 0.05);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w * 0.36, -h * 0.72);
    ctx.quadraticCurveTo(-w * 0.85, -h * (0.62 + Math.sin(this.time * 8) * 0.04), -w * 0.72, -h * 0.44);
    ctx.lineTo(-w * 0.52, -h * 0.56);
    ctx.closePath();
    ctx.fill();

    // 头
    ctx.fillStyle = '#ffd2a4';
    ctx.beginPath();
    ctx.arc(0, -h * 0.82, w * 0.31, 0, Math.PI * 2);
    ctx.fill();

    // 护目镜
    ctx.fillStyle = '#2b4662';
    ctx.fillRect(-w * 0.26, -h * 0.9, w * 0.52, h * 0.11);
    ctx.fillStyle = '#62e6ff';
    ctx.fillRect(-w * 0.16, -h * 0.885, w * 0.18, h * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-w * 0.13, -h * 0.88, w * 0.05, h * 0.025);

    // 背包
    ctx.fillStyle = '#5d4a36';
    roundedRect(ctx, -w * 0.58, -h * 0.68, w * 0.22, h * 0.32, w * 0.05);
    ctx.fill();

    // 手臂
    ctx.fillStyle = '#ffd2a4';
    roundedRect(ctx, w * 0.26, -h * 0.62 + (run ? swing : 0), w * 0.15, h * 0.22, w * 0.06);
    ctx.fill();

    ctx.restore();
    void theme;
  }

  drawParticles(ctx) {
    const { cell } = this;
    for (const particle of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(
        particle.x * cell - particle.size / 2,
        particle.y * cell - particle.size / 2,
        particle.size,
        particle.size,
      );
      ctx.restore();
    }
  }
}
