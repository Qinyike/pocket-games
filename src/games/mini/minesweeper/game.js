import { MinesweeperGame, DIFFICULTIES } from './logic.js';
import { miniState, updateMini } from '../../../core/storage.js';
import { playSound, startMusic } from '../../../core/sound.js';
import { vibrate } from '../../../core/haptics.js';
import { showOverlay, hideOverlay, isOverlayOpen } from '../../../core/ui.js';
import { el, hudPill, button, formatTime, formatScore } from '../shared.js';

const NUMBER_COLORS = ['', '#8fb0ff', '#57d999', '#ff8e6e', '#c8a2ff', '#ffd45c', '#62e6ff', '#f4f6ff', '#ff7188'];

export class MinesweeperUI {
  constructor({ stage, hud, controls, help, onExit, onProgressChange }) {
    this.stage = stage;
    this.hud = hud;
    this.controls = controls;
    this.help = help;
    this.onExit = onExit;
    this.onProgressChange = onProgressChange;
    this.difficulty = miniState('minesweeper').lastDifficulty || 'easy';
    this.engine = new MinesweeperGame(this.difficulty);
    this.flagMode = false;
    this.longPress = 0;
    this.suppressClick = false;
    this.timer = 0;
    this.cleanup = [];
  }

  start() {
    startMusic('puzzle');
    this.help.textContent = '点开格子。数字表示周围的地雷数；长按或开启插旗标记地雷。';
    this.build();
    this.newGame(this.difficulty);
  }

  build() {
    this.hud.replaceChildren(
      hudPill('地雷', 0),
      hudPill('时间', '0:00'),
      hudPill('难度', '初级'),
    );
    this.minesPill = this.hud.children[0].querySelector('strong');
    this.timePill = this.hud.children[1].querySelector('strong');
    this.diffPill = this.hud.children[2].querySelector('strong');

    this.flagBtn = button('插旗', { onClick: () => this.toggleFlagMode() });
    this.diffBtn = button('难度', { onClick: () => this.openDifficulties() });
    this.newBtn = button('新局', { className: 'is-primary', onClick: () => this.newGame(this.difficulty) });
    this.controls.replaceChildren(this.flagBtn, this.diffBtn, this.newBtn);
    this.stage.replaceChildren();
    this.cleanup.push(() => window.clearInterval(this.timer));
  }

  newGame(difficulty) {
    hideOverlay();
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'easy';
    this.engine = new MinesweeperGame(this.difficulty);
    this.flagMode = false;
    this.flagBtn.classList.remove('is-active');
    this.flagBtn.textContent = '插旗';
    window.clearInterval(this.timer);
    this.timer = 0;
    updateMini('minesweeper', (state) => {
      state.lastDifficulty = this.difficulty;
    });
    this.renderBoard();
    this.syncHud();
    this.onProgressChange?.();
  }

  renderBoard() {
    const { cols, rows } = this.engine.config;
    const wrap = el('div', 'ms-wrap');
    const board = el('div', 'ms-board');
    board.style.setProperty('--cols', cols);
    board.style.setProperty('--rows', rows);
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', '扫雷棋盘');
    this.cellEls = [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const cell = el('button', 'ms-cell');
        cell.type = 'button';
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.setAttribute('aria-label', `第 ${y + 1} 行第 ${x + 1} 列`);
        cell.addEventListener('click', () => {
          if (this.suppressClick) {
            this.suppressClick = false;
            return;
          }
          this.handleCell(x, y);
        });
        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.flagAt(x, y);
        });
        cell.addEventListener('pointerdown', () => {
          this.suppressClick = false;
          this.longPress = window.setTimeout(() => {
            this.suppressClick = true;
            this.flagAt(x, y);
          }, 460);
        });
        const clear = () => window.clearTimeout(this.longPress);
        cell.addEventListener('pointerup', clear);
        cell.addEventListener('pointercancel', clear);
        cell.addEventListener('pointerleave', clear);
        board.appendChild(cell);
        this.cellEls.push({ el: cell, x, y });
      }
    }
    wrap.appendChild(board);
    this.stage.replaceChildren(wrap);
    this.boardEl = board;
  }

  handleCell(x, y) {
    if (isOverlayOpen()) return;
    if (this.flagMode) {
      this.flagAt(x, y);
      return;
    }
    const before = this.engine.status;
    const result = this.engine.reveal(x, y);
    if (!result.changed) return;
    if (before === 'ready') this.startTimer();
    playSound(result.lost ? 'boom' : 'tap');
    vibrate(result.lost ? [20, 50, 30] : 4);
    this.renderState();
    this.syncHud();
    if (result.lost) this.gameOver(false);
    else if (result.won) this.gameOver(true);
  }

  flagAt(x, y) {
    if (!this.engine.toggleFlag(x, y)) return;
    playSound('flag');
    vibrate(5);
    this.renderState();
    this.syncHud();
  }

  toggleFlagMode() {
    this.flagMode = !this.flagMode;
    this.flagBtn.classList.toggle('is-active', this.flagMode);
    this.flagBtn.textContent = this.flagMode ? '插旗中' : '插旗';
    playSound('tap');
  }

  startTimer() {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.syncHud();
      if (this.engine.status === 'won' || this.engine.status === 'lost') {
        window.clearInterval(this.timer);
      }
    }, 250);
  }

  syncHud() {
    this.minesPill.textContent = formatScore(this.engine.remainingMines);
    this.timePill.textContent = formatTime(this.engine.elapsed);
    this.diffPill.textContent = this.engine.config.label;
  }

  renderState() {
    for (const entry of this.cellEls) {
      const cell = this.engine.board[entry.y][entry.x];
      const node = entry.el;
      node.className = 'ms-cell';
      if (cell.revealed) {
        node.classList.add('is-revealed');
        if (cell.mine) {
          node.classList.add('is-mine');
          node.textContent = '✹';
        } else if (cell.adjacent > 0) {
          node.textContent = String(cell.adjacent);
          node.classList.add(`n${cell.adjacent}`);
          node.style.color = NUMBER_COLORS[cell.adjacent];
        } else {
          node.textContent = '';
        }
      } else if (cell.flagged) {
        node.classList.add('is-flagged');
        node.textContent = '⚑';
      } else {
        node.textContent = '';
        node.style.color = '';
      }
    }
    if (this.engine.status === 'lost') {
      for (const entry of this.cellEls) {
        const cell = this.engine.board[entry.y][entry.x];
        if (cell.mine && !cell.flagged) entry.el.classList.add('is-mine');
      }
    }
  }

  gameOver(won) {
    window.clearInterval(this.timer);
    const time = this.engine.elapsed;
    const st = miniState('minesweeper');
    let best = st.best?.[this.difficulty] || null;
    let newBest = false;
    if (won) {
      if (best === null || time < best) {
        newBest = true;
        best = time;
      }
      updateMini('minesweeper', (state) => {
        state.wins = (state.wins || 0) + 1;
        state.best = state.best || {};
        if (state.best[this.difficulty] === null || state.best[this.difficulty] === undefined || time < state.best[this.difficulty]) {
          state.best[this.difficulty] = time;
        }
      });
      this.onProgressChange?.();
      playSound('win');
      vibrate([16, 40, 24, 40, 40]);
    } else {
      playSound('gameover');
      vibrate([20, 60, 20, 60, 60]);
    }
    showOverlay({
      kicker: won ? 'CLEARED' : 'BOOM',
      title: won ? '雷区清理完成' : '踩到地雷了',
      theme: 'mini-theme',
      description: won
        ? newBest
          ? '刷新了这个难度的最佳时间。'
          : '安全排除了所有地雷。'
        : '再谨慎一点，数字会告诉你答案。',
      stats: [
        ['难度', this.engine.config.label],
        ['用时', formatTime(time)],
        ['最佳', best === null ? '—' : formatTime(best)],
      ],
      dismissible: false,
      actions: [
        { label: '再来一局', kind: 'primary', onClick: () => this.newGame(this.difficulty) },
        { label: '换难度', onClick: () => { this.openDifficulties(); return false; } },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  openDifficulties() {
    const cards = Object.entries(DIFFICULTIES)
      .map(
        ([key, config]) => `
          <button class="ms-diff ${key === this.difficulty ? 'is-current' : ''}" type="button" data-diff="${key}">
            <strong>${config.label}</strong>
            <span>${config.cols}×${config.rows} · ${config.mines} 雷</span>
          </button>
        `,
      )
      .join('');
    showOverlay({
      kicker: 'DIFFICULTY',
      title: '选择难度',
      theme: 'mini-theme',
      description: '第一次点击一定是安全的。',
      html: `<div class="ms-diffs">${cards}</div>`,
      dismissible: true,
      onMount: (card) => {
        card.querySelectorAll('[data-diff]').forEach((node) => {
          node.addEventListener('click', () => {
            hideOverlay();
            this.newGame(node.dataset.diff);
          });
        });
      },
    });
  }

  restart() {
    this.newGame(this.difficulty);
  }

  destroy() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    window.clearInterval(this.timer);
    hideOverlay();
  }
}
