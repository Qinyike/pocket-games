import { TetrisEngine, COLORS } from './engine.js';
import { playSound } from '../../core/sound.js';
import { vibrate } from '../../core/haptics.js';
import {
  recordTetrisRun,
  state as progress,
} from '../../core/storage.js';
import { showOverlay, hideOverlay, toast, isOverlayOpen, formatNumber } from '../../core/ui.js';

const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;
const DAS_DELAY = 165;
const ARR_INTERVAL = 46;

const KEY_ACTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  ArrowUp: 'rotate-cw',
  x: 'rotate-cw',
  X: 'rotate-cw',
  z: 'rotate-ccw',
  Z: 'rotate-ccw',
  ' ': 'hard-drop',
  c: 'hold',
  C: 'hold',
  Shift: 'hold',
  p: 'pause',
  P: 'pause',
  Escape: 'pause',
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export class TetrisGame {
  constructor({ onExit, onProgressChange } = {}) {
    this.onExit = onExit || (() => {});
    this.onProgressChange = onProgressChange || (() => {});
    this.active = false;
    this.paused = false;
    this.gameOver = false;
    this.engine = new TetrisEngine();
    this.raf = 0;
    this.lastTime = 0;
    this.dropAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.softDropHeld = false;
    this.horizontalDir = null;
    this.horizontalDelay = 0;
    this.horizontalRepeat = 0;
    this.cell = 20;
    this.dpr = 1;
    this.lastUi = {};
    this.gameOverTimer = 0;

    this.screen = document.getElementById('screen-tetris');
    this.canvas = document.getElementById('tetris-board');
    this.wrap = document.getElementById('tetris-board-wrap');
    this.ctx = this.canvas.getContext('2d');
    this.holdCanvas = document.getElementById('tetris-hold');
    this.holdCtx = this.holdCanvas.getContext('2d');
    this.nextCanvas = document.getElementById('tetris-next');
    this.nextCtx = this.nextCanvas.getContext('2d');
    this.scoreEl = document.getElementById('tetris-score');
    this.levelEl = document.getElementById('tetris-level');
    this.linesEl = document.getElementById('tetris-lines');
    this.statusEl = document.getElementById('tetris-status');
    this.pauseBtn = document.getElementById('tetris-pause');
    this.flashEl = document.getElementById('tetris-flash');

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

    this.screen.querySelectorAll('[data-tetris]').forEach((button) => {
      const action = button.dataset.tetris;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.classList.add('is-pressed');
        if (action === 'left' || action === 'right') {
          this.startHorizontal(action);
        } else if (action === 'soft-drop') {
          this.softDropHeld = true;
          this.applySoftDrop();
        } else if (action === 'rotate-cw') {
          this.rotate(1);
        } else if (action === 'rotate-ccw') {
          this.rotate(-1);
        } else if (action === 'hard-drop') {
          this.hardDrop();
        } else if (action === 'hold') {
          this.holdPiece();
        }
      });
      const release = () => {
        button.classList.remove('is-pressed');
        if (action === 'left' || action === 'right') this.stopHorizontal();
        if (action === 'soft-drop') this.softDropHeld = false;
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.wrap);
  }

  start() {
    window.clearTimeout(this.gameOverTimer);
    hideOverlay();
    this.active = true;
    this.paused = false;
    this.gameOver = false;
    this.softDropHeld = false;
    this.stopHorizontal();
    this.engine.reset();
    this.dropAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.lastTime = 0;
    this.clearUiCache();
    this.handleResize();
    this.syncHud(true);
    this.renderMini();
    this.render();
    playSound('pause');
    document.addEventListener('keydown', this.handleKeydown);
    document.addEventListener('keyup', this.handleKeyup);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    this.startLoop();
  }

  stop() {
    this.active = false;
    this.paused = false;
    this.softDropHeld = false;
    this.stopHorizontal();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.clearTimeout(this.gameOverTimer);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('keyup', this.handleKeyup);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    if (isOverlayOpen()) hideOverlay();
  }

  startLoop() {
    cancelAnimationFrame(this.raf);
    this.lastTime = 0;
    const loop = (now) => {
      if (!this.active) return;
      if (!this.lastTime) this.lastTime = now;
      const dt = Math.min(100, now - this.lastTime);
      this.lastTime = now;
      if (!this.paused && !this.gameOver) {
        this.update(dt);
      }
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  handleVisibility() {
    if (!this.active) return;
    if (document.hidden && !this.paused && !this.gameOver) {
      this.pauseGame(true);
    }
  }

  update(dt) {
    const engine = this.engine;
    if (!engine.active) {
      if (engine.gameOver) this.handleGameOver();
      return;
    }

    if (engine.isGrounded) {
      this.lockAcc += dt;
      if (this.lockAcc >= LOCK_DELAY) {
        this.lockActive();
        return;
      }
    } else {
      this.lockAcc = 0;
      this.dropAcc += dt;
      const interval = this.softDropHeld ? Math.min(45, engine.gravityMs) : engine.gravityMs;
      if (this.dropAcc >= interval) {
        this.dropAcc = 0;
        const moved = this.softDropHeld ? engine.softDrop() : engine.move(0, 1);
        if (moved) {
          this.lockAcc = 0;
          this.lockResets = 0;
          this.syncHud();
        }
      }
    }

    if (this.horizontalDir) {
      // 按住按钮时由定时器负责自动重复，这里只维持状态。
    }
  }

  lockActive() {
    if (!this.engine.active || this.gameOver) return;
    const result = this.engine.lock();
    this.lockAcc = 0;
    this.dropAcc = 0;
    this.lockResets = 0;
    if (!result) return;

    if (result.cleared > 0) {
      playSound(result.cleared === 4 ? 'tetris' : 'clear');
      vibrate(result.cleared === 4 ? [18, 50, 18, 50, 40] : [12, 35, 18]);
      this.flashBoard();
      if (result.cleared === 4) toast('四行消除！');
    } else {
      playSound('lock');
      vibrate(8);
    }

    this.syncHud();
    this.renderMini();
    if (this.engine.gameOver || result.gameOver) {
      this.handleGameOver();
    }
  }

  moveHorizontal(direction) {
    if (!this.active || this.paused || this.gameOver) return;
    const delta = direction === 'left' ? -1 : 1;
    if (this.engine.move(delta, 0)) {
      this.afterPlayerAction();
    }
  }

  startHorizontal(direction) {
    if (!this.active || this.paused || this.gameOver) return;
    this.stopHorizontal();
    this.horizontalDir = direction;
    this.moveHorizontal(direction);
    this.horizontalDelay = window.setTimeout(() => {
      this.horizontalRepeat = window.setInterval(() => {
        this.moveHorizontal(direction);
      }, ARR_INTERVAL);
    }, DAS_DELAY);
  }

  stopHorizontal() {
    this.horizontalDir = null;
    window.clearTimeout(this.horizontalDelay);
    window.clearInterval(this.horizontalRepeat);
    this.horizontalDelay = 0;
    this.horizontalRepeat = 0;
  }

  rotate(direction) {
    if (!this.active || this.paused || this.gameOver) return;
    if (this.engine.rotate(direction)) {
      playSound('rotate');
      this.afterPlayerAction();
    } else {
      playSound('blocked');
    }
  }

  applySoftDrop() {
    if (!this.active || this.paused || this.gameOver) return;
    if (this.engine.softDrop()) {
      this.lockAcc = 0;
      this.lockResets = 0;
      this.syncHud();
    }
  }

  hardDrop() {
    if (!this.active || this.paused || this.gameOver) return;
    const result = this.engine.hardDrop();
    if (!result.locked) return;
    playSound('hardDrop');
    vibrate(12);
    this.lockAcc = 0;
    this.lockResets = 0;
    if (result.cleared > 0) {
      playSound(result.cleared === 4 ? 'tetris' : 'clear');
      vibrate(result.cleared === 4 ? [18, 50, 18, 50, 40] : [12, 35, 18]);
      this.flashBoard();
      if (result.cleared === 4) toast('四行消除！');
    }
    this.syncHud();
    this.renderMini();
    if (result.gameOver || this.engine.gameOver) this.handleGameOver();
  }

  holdPiece() {
    if (!this.active || this.paused || this.gameOver) return;
    if (this.engine.hold()) {
      playSound('hold');
      this.lockAcc = 0;
      this.lockResets = 0;
      this.syncHud();
      this.renderMini();
      if (this.engine.gameOver) this.handleGameOver();
    } else {
      playSound('blocked');
    }
  }

  afterPlayerAction() {
    if (this.engine.isGrounded) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockAcc = 0;
        this.lockResets += 1;
      }
    } else {
      this.lockAcc = 0;
    }
  }

  pauseGame(auto = false) {
    if (!this.active || this.paused || this.gameOver) return;
    this.paused = true;
    this.softDropHeld = false;
    this.stopHorizontal();
    playSound('pause');
    this.syncHud(true);
    showOverlay({
      kicker: auto ? 'AUTO PAUSED' : 'PAUSED',
      title: auto ? '已自动暂停' : '暂停一下',
      description: '俄罗斯方块会等你回来。',
      theme: 'tetris-theme',
      stats: [
        ['分数', formatNumber(this.engine.score)],
        ['消行', String(this.engine.lines)],
        ['等级', String(this.engine.level)],
      ],
      dismissible: false,
      actions: [
        { label: '继续游戏', kind: 'cyan', onClick: () => this.resumeGame() },
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
    this.syncHud(true);
    playSound('pause');
  }

  restart() {
    window.clearTimeout(this.gameOverTimer);
    hideOverlay();
    this.paused = false;
    this.gameOver = false;
    this.softDropHeld = false;
    this.stopHorizontal();
    this.engine.reset();
    this.dropAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.lastTime = 0;
    this.clearUiCache();
    this.syncHud(true);
    this.renderMini();
    this.syncHud(true);
  }

  handleGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.stopHorizontal();
    this.softDropHeld = false;
    playSound('gameover');
    vibrate([20, 60, 20, 60, 60]);
    const { isNewBest, previousHigh } = recordTetrisRun(
      this.engine.score,
      this.engine.lines,
      this.engine.level,
    );
    this.syncHud(true);
    this.onProgressChange();
    this.gameOverTimer = window.setTimeout(() => {
      if (!this.active) return;
      showOverlay({
        kicker: isNewBest ? 'NEW HIGH SCORE' : 'GAME OVER',
        title: isNewBest ? '新纪录！' : '游戏结束',
        description: isNewBest
          ? previousHigh > 0
            ? `超过了之前的 ${formatNumber(previousHigh)} 分。`
            : '第一局就留下了纪录，不错。'
          : `再试一次，也许就能超过 ${formatNumber(progress.tetris.highScore)} 分。`,
        theme: 'tetris-theme',
        stats: [
          ['分数', formatNumber(this.engine.score)],
          ['消行', String(this.engine.lines)],
          ['等级', String(this.engine.level)],
        ],
        dismissible: false,
        actions: [
          { label: '再来一局', kind: 'cyan', onClick: () => this.restart() },
          { label: '返回大厅', onClick: () => this.onExit() },
        ],
      });
    }, 520);
  }

  handleKeydown(event) {
    if (!this.active || isOverlayOpen()) return;
    const action = KEY_ACTIONS[event.key];
    if (!action) return;
    if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault();
    if (event.repeat) return;

    if (action === 'left' || action === 'right') {
      this.startHorizontal(action);
    } else if (action === 'soft') {
      this.softDropHeld = true;
      this.applySoftDrop();
    } else if (action === 'rotate-cw') {
      this.rotate(1);
    } else if (action === 'rotate-ccw') {
      this.rotate(-1);
    } else if (action === 'hard-drop') {
      this.hardDrop();
    } else if (action === 'hold') {
      this.holdPiece();
    } else if (action === 'pause') {
      this.pauseGame();
    }
  }

  handleKeyup(event) {
    const action = KEY_ACTIONS[event.key];
    if (action === 'left' || action === 'right') {
      this.stopHorizontal();
    } else if (action === 'soft') {
      this.softDropHeld = false;
    }
  }

  handleResize() {
    if (!this.canvas) return;
    const rect = this.wrap.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const maxW = rect.width - 4;
    const maxH = rect.height - 4;
    this.cell = Math.max(10, Math.floor(Math.min(maxW / this.engine.cols, maxH / this.engine.rows)));
    const width = this.cell * this.engine.cols;
    const height = this.cell * this.engine.rows;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.renderMini();
    this.render();
  }

  setupMini(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(40, rect.width);
    const height = Math.max(24, rect.height);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  drawBlock(ctx, x, y, cell, type, options = {}) {
    const color = COLORS[type] || '#fff';
    const pad = Math.max(0.5, cell * 0.045);
    const px = x * cell + pad;
    const py = y * cell + pad;
    const size = cell - pad * 2;
    const radius = Math.max(1.5, cell * 0.16);

    if (options.ghost) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = color;
      this.roundRect(ctx, px, py, size, size, radius);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
      return;
    }

    const gradient = ctx.createLinearGradient(px, py, px + size, py + size);
    gradient.addColorStop(0, lighten(color, 0.34));
    gradient.addColorStop(0.55, color);
    gradient.addColorStop(1, lighten(color, -0.12));
    ctx.fillStyle = gradient;
    this.roundRect(ctx, px, py, size, size, radius);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    this.roundRect(ctx, px + size * 0.13, py + size * 0.09, size * 0.74, size * 0.2, radius * 0.7);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#0c1424';
    ctx.lineWidth = Math.max(0.8, cell * 0.05);
    this.roundRect(ctx, px, py, size, size, radius);
    ctx.stroke();
    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  render() {
    const ctx = this.ctx;
    const cell = this.cell;
    const width = this.engine.cols * cell;
    const height = this.engine.rows * cell;

    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0b1427');
    bg.addColorStop(1, '#070c18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.055)';
    ctx.lineWidth = 1;
    for (let x = 1; x < this.engine.cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, height);
      ctx.stroke();
    }
    for (let y = 1; y < this.engine.rows; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(width, y * cell + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    for (const block of this.engine.inactiveCells) {
      this.drawBlock(ctx, block.x, block.y, cell, block.type);
    }
    if (this.engine.active && !this.gameOver) {
      for (const block of this.engine.ghostCells) {
        this.drawBlock(ctx, block.x, block.y, cell, block.type, { ghost: true });
      }
      for (const block of this.engine.activeCells) {
        this.drawBlock(ctx, block.x, block.y, cell, block.type);
      }
    }
  }

  renderMini() {
    this.renderHold();
    this.renderNext();
  }

  renderHold() {
    const ctx = this.holdCtx;
    if (!ctx) return;
    const { width, height } = this.setupMini(this.holdCanvas, ctx);
    ctx.clearRect(0, 0, width, height);
    const type = this.engine.holdType;
    if (!type) {
      ctx.fillStyle = 'rgba(151, 163, 194, 0.4)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('空', width / 2, height / 2 + 3);
      return;
    }
    this.drawMiniPiece(ctx, type, width / 2, height / 2, 11);
  }

  renderNext() {
    const ctx = this.nextCtx;
    if (!ctx) return;
    const { width, height } = this.setupMini(this.nextCanvas, ctx);
    ctx.clearRect(0, 0, width, height);
    const pieces = this.engine.nextPieces;
    if (pieces.length === 0) return;
    const cell = 9;
    const slot = width / pieces.length;
    pieces.forEach((type, index) => {
      this.drawMiniPiece(ctx, type, slot * index + slot / 2, height / 2, cell);
    });
  }

  drawMiniPiece(ctx, type, centerX, centerY, cell) {
    const matrix = this.engine.matrixFor(type, 0);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (!matrix[y][x]) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const pieceW = (maxX - minX + 1) * cell;
    const pieceH = (maxY - minY + 1) * cell;
    const offsetX = centerX - pieceW / 2 - minX * cell;
    const offsetY = centerY - pieceH / 2 - minY * cell;
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (!matrix[y][x]) continue;
        ctx.save();
        ctx.translate(offsetX, offsetY);
        this.drawBlock(ctx, x, y, cell, type);
        ctx.restore();
      }
    }
  }

  flashBoard() {
    this.flashEl.classList.remove('is-active');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('is-active');
  }

  clearUiCache() {
    this.lastUi = {};
  }

  syncHud(force = false) {
    const score = formatNumber(this.engine.score);
    const level = String(this.engine.level);
    const lines = String(this.engine.lines);
    let status = `第 ${this.engine.level} 级`;
    if (this.gameOver) status = '游戏结束';
    else if (this.paused) status = '已暂停';

    if (force || this.lastUi.score !== score) {
      this.scoreEl.textContent = score;
      this.lastUi.score = score;
    }
    if (force || this.lastUi.level !== level) {
      this.levelEl.textContent = level;
      this.lastUi.level = level;
    }
    if (force || this.lastUi.lines !== lines) {
      this.linesEl.textContent = lines;
      this.lastUi.lines = lines;
    }
    if (force || this.lastUi.status !== status) {
      this.statusEl.textContent = status;
      this.lastUi.status = status;
    }
  }
}
