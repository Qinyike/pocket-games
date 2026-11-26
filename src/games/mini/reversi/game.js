import {
  SIZE, EMPTY, BLACK, WHITE, createBoard, legalMoves, place, countDiscs, chooseMove,
} from './logic.js';
import { miniState, updateMini } from '../../../core/storage.js';
import { playSound, startMusic } from '../../../core/sound.js';
import { vibrate } from '../../../core/haptics.js';
import { showOverlay, hideOverlay, isOverlayOpen } from '../../../core/ui.js';
import { el, hudPill, button } from '../shared.js';

const NAME = { [BLACK]: '黑棋', [WHITE]: '白棋' };

export class ReversiGame {
  constructor({ stage, hud, controls, help, onExit, onProgressChange }) {
    this.stage = stage; this.hud = hud; this.controls = controls; this.help = help;
    this.onExit = onExit; this.onProgressChange = onProgressChange;
    this.difficulty = miniState('reversi').difficulty || 'normal';
    this.cells = [];
    this.timer = 0;
  }

  start() {
    startMusic('puzzle');
    this.build();
    this.newGame();
  }

  build() {
    this.hud.replaceChildren(
      hudPill('黑棋', 2, 'is-good'), hudPill('白棋', 2),
      hudPill('你', '黑'), hudPill('战绩', '0 胜 0 负'),
    );
    this.blackPill = this.hud.children[0].querySelector('strong');
    this.whitePill = this.hud.children[1].querySelector('strong');
    this.turnPill = this.hud.children[2].querySelector('strong');
    this.recordPill = this.hud.children[3].querySelector('strong');
    this.updateStats();

    this.boardEl = el('div', 'reversi-board');
    this.boardEl.style.setProperty('--size', SIZE);
    this.boardEl.setAttribute('role', 'grid');
    this.boardEl.setAttribute('aria-label', '黑白棋棋盘');
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const cell = el('button', 'reversi-cell');
        cell.type = 'button';
        cell.addEventListener('click', () => this.playHuman(x, y));
        this.boardEl.appendChild(cell);
        this.cells.push({ x, y, el: cell });
      }
    }
    const wrap = el('div', 'reversi-wrap');
    wrap.appendChild(this.boardEl);
    this.stage.replaceChildren(wrap);

    this.controls.replaceChildren(
      button('新局', { className: 'is-primary', onClick: () => this.newGame() }),
      button('悔棋', { onClick: () => this.undo() }),
      button('难度', { onClick: () => this.openDifficulties() }),
    );
  }

  updateStats() {
    const st = miniState('reversi');
    this.recordPill.textContent = `${st.wins || 0} 胜 ${st.losses || 0} 负`;
  }

  newGame() {
    window.clearTimeout(this.timer);
    hideOverlay();
    this.board = createBoard();
    this.turn = BLACK;
    this.history = [];
    this.busy = false;
    this.over = false;
    this.help.textContent = '你执黑。落子必须夹住对方棋子，最后棋子多的一方获胜。';
    this.render();
    updateMini('reversi', (state) => { state.difficulty = this.difficulty; });
  }

  playHuman(x, y) {
    if (this.busy || this.over || this.turn !== BLACK || isOverlayOpen()) return;
    if (!this.doPlace(x, y, BLACK)) return;
    if (this.over) return;
    this.busy = true;
    this.updateTurn();
    this.timer = window.setTimeout(() => this.playAi(), 260);
  }

  doPlace(x, y, player) {
    const flips = place(this.board, x, y, player);
    if (!flips.length) return false;
    this.history.push({ x, y, player, flips });
    playSound('stone');
    vibrate(4);
    this.render();
    this.updateCounts();
    return true;
  }

  playAi() {
    if (this.over) return;
    const moves = legalMoves(this.board, WHITE);
    if (!moves.length) {
      this.busy = false;
      this.afterMove();
      return;
    }
    const move = chooseMove(this.board, WHITE, this.difficulty);
    this.doPlace(move.x, move.y, WHITE);
    this.busy = false;
    if (!this.over) this.afterMove();
  }

  afterMove() {
    const blackMoves = legalMoves(this.board, BLACK);
    const whiteMoves = legalMoves(this.board, WHITE);
    if (!blackMoves.length && !whiteMoves.length) {
      this.finish();
      return;
    }
    if (!blackMoves.length) {
      this.help.textContent = '你没有可落子的位置，轮到 AI 继续。';
      this.busy = true;
      this.timer = window.setTimeout(() => this.playAi(), 400);
      return;
    }
    this.turn = BLACK;
    this.busy = false;
    this.updateTurn();
  }

  updateTurn() {
    this.turnPill.textContent = this.busy ? 'AI 思考' : '黑棋';
    this.turnPill.parentElement.classList.toggle('is-good', !this.busy);
    this.help.textContent = this.busy ? 'AI 思考中…' : '轮到你落子（黑棋）';
  }

  updateCounts() {
    const { black, white } = countDiscs(this.board);
    this.blackPill.textContent = String(black);
    this.whitePill.textContent = String(white);
  }

  finish() {
    this.over = true;
    this.busy = false;
    window.clearTimeout(this.timer);
    const { black, white } = countDiscs(this.board);
    let result = 'draw';
    if (black > white) result = 'win';
    else if (white > black) result = 'loss';
    if (result === 'win') {
      updateMini('reversi', (state) => { state.wins = (state.wins || 0) + 1; });
    } else if (result === 'loss') {
      updateMini('reversi', (state) => { state.losses = (state.losses || 0) + 1; });
    } else {
      updateMini('reversi', (state) => { state.draws = (state.draws || 0) + 1; });
    }
    this.updateStats();
    this.onProgressChange?.();
    playSound(result === 'win' ? 'win' : result === 'loss' ? 'gameover' : 'tap');
    this.render();
    showOverlay({
      kicker: 'GAME OVER',
      title: result === 'win' ? '黑棋获胜' : result === 'loss' ? '白棋获胜' : '平局',
      theme: 'mini-theme',
      description: result === 'win' ? '你吃下了更多格子。' : result === 'loss' ? '角位很关键，再试一次。' : '双方棋子一样多。',
      stats: [['黑棋', black], ['白棋', white], ['战绩', this.recordPill.textContent]],
      dismissible: false,
      actions: [
        { label: '再来一局', kind: 'primary', onClick: () => this.newGame() },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  undo() {
    if (this.busy || this.over || !this.history.length || isOverlayOpen()) return;
    let removed = 0;
    while (this.history.length && removed < 2) {
      const move = this.history.pop();
      this.board[move.y][move.x] = EMPTY;
      for (const cell of move.flips) this.board[cell.y][cell.x] = move.player === BLACK ? WHITE : BLACK;
      removed += 1;
      if (move.player === BLACK) break;
    }
    this.turn = BLACK;
    this.over = false;
    this.busy = false;
    this.render();
    this.updateCounts();
    this.updateTurn();
    playSound('undo');
  }

  render() {
    const legal = this.turn === BLACK && !this.busy && !this.over
      ? new Set(legalMoves(this.board, BLACK).map((m) => `${m.x},${m.y}`))
      : new Set();
    const last = this.history[this.history.length - 1];
    for (const entry of this.cells) {
      const value = this.board[entry.y][entry.x];
      entry.el.className = 'reversi-cell';
      entry.el.replaceChildren();
      entry.el.style.removeProperty('background');
      if (value !== EMPTY) {
        entry.el.appendChild(el('span', `reversi-disc ${value === BLACK ? 'is-black' : 'is-white'}`));
      } else if (legal.has(`${entry.x},${entry.y}`)) {
        entry.el.classList.add('is-legal');
        entry.el.appendChild(el('span', 'reversi-hint'));
      }
      if (last && last.x === entry.x && last.y === entry.y) entry.el.classList.add('is-last');
    }
  }

  openDifficulties() {
    showOverlay({
      kicker: 'DIFFICULTY', title: 'AI 难度', theme: 'mini-theme',
      description: '简单模式会随机挑一步，普通模式更重视角位。',
      html: `<div class="ms-diffs">
        <button class="ms-diff ${this.difficulty === 'easy' ? 'is-current' : ''}" type="button" data-diff="easy"><strong>简单</strong><span>随机走子</span></button>
        <button class="ms-diff ${this.difficulty === 'normal' ? 'is-current' : ''}" type="button" data-diff="normal"><strong>普通</strong><span>重视角位</span></button>
      </div>`,
      dismissible: true,
      onMount: (card) => {
        card.querySelectorAll('[data-diff]').forEach((node) => {
          node.addEventListener('click', () => {
            this.difficulty = node.dataset.diff;
            hideOverlay();
            this.newGame();
          });
        });
      },
    });
  }

  restart() { this.newGame(); }
  destroy() { window.clearTimeout(this.timer); hideOverlay(); }
}
