import {
  createBoard,
  move,
  canMove,
  hasValue,
  spawnTile,
  bestTile,
} from './logic.js';
import { miniState, updateMini } from '../../../core/storage.js';
import { playSound, startMusic } from '../../../core/sound.js';
import { vibrate } from '../../../core/haptics.js';
import { showOverlay, hideOverlay, isOverlayOpen } from '../../../core/ui.js';
import {
  el,
  hudPill,
  button,
  formatScore,
  bindSwipe,
  createKeyHandler,
} from '../shared.js';

const CELL_DIRECTIONS = {
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

export class Game2048 {
  constructor({ stage, hud, controls, help, onExit, onProgressChange }) {
    this.stage = stage;
    this.hud = hud;
    this.controls = controls;
    this.help = help;
    this.onExit = onExit;
    this.onProgressChange = onProgressChange;
    this.board = createBoard();
    this.score = 0;
    this.history = [];
    this.celebrated = false;
    this.over = false;
    this.cleanup = [];
    this.cells = [];
    this.best = miniState('2048').best || 0;
  }

  start() {
    startMusic('puzzle');
    this.help.textContent = '滑动或使用方向键合并数字，凑出 2048。';
    this.build();
    this.bind();
    this.newGame();
  }

  build() {
    this.hud.replaceChildren(
      hudPill('分数', 0),
      hudPill('最佳', this.best),
      hudPill('最大', 2),
    );
    this.scorePill = this.hud.children[0].querySelector('strong');
    this.bestPill = this.hud.children[1].querySelector('strong');
    this.maxPill = this.hud.children[2].querySelector('strong');

    const wrap = el('div', 'g2048-wrap');
    const board = el('div', 'g2048-board');
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', '2048 棋盘');
    this.cells = [];
    for (let index = 0; index < 16; index += 1) {
      const cell = el('div', 'g2048-cell');
      const tile = el('div', 'g2048-tile');
      cell.appendChild(tile);
      board.appendChild(cell);
      this.cells.push(tile);
    }
    wrap.appendChild(board);
    this.stage.replaceChildren(wrap);
    this.boardEl = board;

    this.undoBtn = button('撤销', { onClick: () => this.undo() });
    this.newBtn = button('新游戏', { className: 'is-primary', onClick: () => this.newGame() });
    this.controls.replaceChildren(this.undoBtn, this.newBtn);
    this.undoBtn.disabled = true;
    this.resultTimer = 0;
  }

  bind() {
    this.cleanup.push(bindSwipe(this.boardEl, (direction) => this.tryMove(direction)));
    this.cleanup.push(
      createKeyHandler((event) => {
        if (isOverlayOpen()) return false;
        const direction = CELL_DIRECTIONS[event.key];
        if (direction) {
          this.tryMove(direction);
          return true;
        }
        if (event.key === 'z' || event.key === 'Z') {
          this.undo();
          return true;
        }
        if (event.key === 'r' || event.key === 'R') {
          this.newGame();
          return true;
        }
        return false;
      }),
    );
  }

  newGame() {
    window.clearTimeout(this.resultTimer);
    hideOverlay();
    this.board = createBoard();
    this.score = 0;
    this.history = [];
    this.celebrated = false;
    this.over = false;
    this.spawnCells = new Set();
    this.render();
    updateMini('2048', (state) => {
      state.plays += 1;
    });
    this.onProgressChange?.();
  }

  snapshot() {
    this.history.push({
      board: this.board.map((row) => row.slice()),
      score: this.score,
      celebrated: this.celebrated,
    });
    if (this.history.length > 20) this.history.shift();
  }

  undo() {
    if (!this.history.length || this.over || isOverlayOpen()) return;
    const state = this.history.pop();
    this.board = state.board;
    this.score = state.score;
    this.celebrated = state.celebrated;
    this.render();
    playSound('undo');
    this.undoBtn.disabled = this.history.length === 0;
  }

  tryMove(direction) {
    if (this.over || isOverlayOpen()) return;
    const result = move(this.board, direction);
    if (!result.moved) return;
    this.snapshot();
    this.board = result.board;
    this.score += result.gained;
    this.spawnCells = new Set();
    const spot = spawnTile(this.board);
    if (spot) this.spawnCells.add(`${spot.x},${spot.y}`);
    this.updateBest();
    this.render();

    if (result.gained > 0) {
      playSound('merge');
      vibrate(6);
    } else {
      playSound('tap');
    }

    if (!this.celebrated && hasValue(this.board, 2048)) {
      this.celebrated = true;
      this.resultTimer = window.setTimeout(() => this.showWin(), 280);
    } else if (!canMove(this.board)) {
      this.over = true;
      this.resultTimer = window.setTimeout(() => this.showOver(), 320);
    }
  }

  updateBest() {
    if (this.score <= this.best) return;
    this.best = this.score;
    updateMini('2048', (state) => {
      state.best = this.best;
    });
    this.bestPill.textContent = formatScore(this.best);
    this.onProgressChange?.();
  }

  render() {
    const max = bestTile(this.board);
    this.scorePill.textContent = formatScore(this.score);
    this.bestPill.textContent = formatScore(this.best);
    this.maxPill.textContent = formatScore(max);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const value = this.board[y][x];
        const tile = this.cells[y * 4 + x];
        tile.textContent = value ? String(value) : '';
        tile.className = `g2048-tile${value ? ` v${value > 4096 ? 'super' : value}` : ''}${
          this.spawnCells?.has(`${x},${y}`) ? ' is-spawn' : ''
        }`;
      }
    }
    this.undoBtn.disabled = this.history.length === 0;
  }

  showWin() {
    if (this.over || !hasValue(this.board, 2048)) return;
    playSound('win');
    vibrate([16, 50, 24, 50, 40]);
    showOverlay({
      kicker: '2048',
      title: '达到 2048！',
      description: '还可以继续挑战更大的数字。',
      theme: 'mini-theme',
      stats: [
        ['分数', formatScore(this.score)],
        ['最佳', formatScore(this.best)],
        ['最大', formatScore(bestTile(this.board))],
      ],
      actions: [
        { label: '继续挑战', kind: 'primary', onClick: () => { hideOverlay(); if (!canMove(this.board)) { this.over = true; this.showOver(); } } },
        { label: '新游戏', onClick: () => this.newGame() },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  showOver() {
    if (!this.over) return;
    playSound('gameover');
    this.onProgressChange?.();
    showOverlay({
      kicker: 'GAME OVER',
      title: '没有可合并的数字了',
      theme: 'mini-theme',
      description: '换个开局，或者继续冲更高分。',
      stats: [
        ['分数', formatScore(this.score)],
        ['最佳', formatScore(this.best)],
        ['最大', formatScore(bestTile(this.board))],
      ],
      dismissible: false,
      actions: [
        { label: '再来一局', kind: 'primary', onClick: () => this.newGame() },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  restart() {
    this.newGame();
  }

  destroy() {
    window.clearTimeout(this.resultTimer);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    hideOverlay();
  }
}
