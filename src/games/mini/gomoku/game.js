import { SIZE, EMPTY, BLACK, WHITE, createBoard, checkWinner, isFull, chooseMove } from './logic.js';
import { miniState, updateMini } from '../../../core/storage.js';
import { playSound, startMusic } from '../../../core/sound.js';
import { vibrate } from '../../../core/haptics.js';
import { showOverlay, hideOverlay, isOverlayOpen } from '../../../core/ui.js';
import { el, hudPill, button } from '../shared.js';

export class GomokuGame {
  constructor({ stage, hud, controls, help, onExit, onProgressChange }) {
    this.stage = stage; this.hud = hud; this.controls = controls; this.help = help;
    this.onExit = onExit; this.onProgressChange = onProgressChange;
    this.difficulty = miniState('gomoku').difficulty || 'normal';
    this.timer = 0;
    this.cells = [];
  }

  start() {
    startMusic('puzzle');
    this.build();
    this.newGame();
  }

  build() {
    this.hud.replaceChildren(
      hudPill('你', 0, 'is-good'), hudPill('AI', 0),
      hudPill('战绩', '0 胜 0 负'), hudPill('难度', this.difficulty === 'easy' ? '简单' : '普通'),
    );
    this.youPill = this.hud.children[0].querySelector('strong');
    this.aiPill = this.hud.children[1].querySelector('strong');
    this.recordPill = this.hud.children[2].querySelector('strong');
    this.diffPill = this.hud.children[3].querySelector('strong');
    this.updateStats();

    this.boardEl = el('div', 'gomoku-board');
    this.boardEl.style.setProperty('--size', SIZE);
    this.boardEl.setAttribute('role', 'grid');
    this.boardEl.setAttribute('aria-label', '五子棋棋盘');
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const cell = el('button', 'gomoku-cell');
        cell.type = 'button';
        cell.addEventListener('click', () => this.playHuman(x, y));
        this.boardEl.appendChild(cell);
        this.cells.push({ x, y, el: cell });
      }
    }
    const wrap = el('div', 'gomoku-wrap');
    wrap.appendChild(this.boardEl);
    this.stage.replaceChildren(wrap);

    this.controls.replaceChildren(
      button('新局', { className: 'is-primary', onClick: () => this.newGame() }),
      button('悔棋', { onClick: () => this.undo() }),
      button('难度', { onClick: () => this.openDifficulties() }),
    );
  }

  updateStats() {
    const st = miniState('gomoku');
    this.recordPill.textContent = `${st.wins || 0} 胜 ${st.losses || 0} 负`;
    this.diffPill.textContent = this.difficulty === 'easy' ? '简单' : '普通';
  }

  newGame() {
    window.clearTimeout(this.timer);
    hideOverlay();
    this.board = createBoard();
    this.history = [];
    this.turn = BLACK;
    this.busy = false;
    this.over = false;
    this.youPill.textContent = '0';
    this.aiPill.textContent = '0';
    this.help.textContent = '你执黑先行，五子连珠获胜。点棋盘落子。';
    this.render();
    updateMini('gomoku', (state) => { state.difficulty = this.difficulty; });
  }

  playHuman(x, y) {
    if (this.busy || this.over || this.turn !== BLACK || this.board[y][x] !== EMPTY || isOverlayOpen()) return;
    this.place(x, y, BLACK);
    if (this.over) return;
    this.busy = true;
    this.help.textContent = 'AI 思考中…';
    this.timer = window.setTimeout(() => this.playAi(), 250);
  }

  place(x, y, player) {
    this.board[y][x] = player;
    this.history.push({ x, y, player });
    playSound('stone');
    vibrate(4);
    this.render();
    const winner = checkWinner(this.board, x, y, player);
    if (winner) return this.finish(winner);
    if (isFull(this.board)) return this.finish(0);
    this.turn = player === BLACK ? WHITE : BLACK;
  }

  playAi() {
    if (this.over) return;
    const move = chooseMove(this.board, WHITE, BLACK, this.difficulty);
    this.place(move.x, move.y, WHITE);
    this.busy = false;
    if (!this.over) this.help.textContent = '轮到你落子';
  }

  finish(winner) {
    this.over = true;
    this.busy = false;
    window.clearTimeout(this.timer);
    if (winner === BLACK) {
      updateMini('gomoku', (state) => { state.wins = (state.wins || 0) + 1; });
    } else if (winner === WHITE) {
      updateMini('gomoku', (state) => { state.losses = (state.losses || 0) + 1; });
    } else {
      updateMini('gomoku', (state) => { state.draws = (state.draws || 0) + 1; });
    }
    this.updateStats();
    this.onProgressChange?.();
    playSound(winner === BLACK ? 'win' : winner === WHITE ? 'gameover' : 'tap');
    vibrate(winner === BLACK ? [16, 40, 24, 40, 40] : [20, 50, 20]);
    const result = winner === BLACK ? 'win' : winner === WHITE ? 'loss' : 'draw';
    this.render();
    showOverlay({
      kicker: result === 'win' ? 'YOU WIN' : result === 'loss' ? 'AI WINS' : 'DRAW',
      title: result === 'win' ? '五子连珠！' : result === 'loss' ? '这局输了' : '和棋',
      theme: 'mini-theme',
      description: result === 'win' ? '漂亮的连线。' : result === 'loss' ? '再换一条路线试试。' : '棋盘满了，势均力敌。',
      stats: [
        ['你', this.history.filter((m) => m.player === BLACK).length],
        ['AI', this.history.filter((m) => m.player === WHITE).length],
        ['战绩', this.recordPill.textContent],
      ],
      dismissible: false,
      actions: [
        { label: '再来一局', kind: 'primary', onClick: () => this.newGame() },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  undo() {
    if (this.busy || this.over || isOverlayOpen()) return;
    let removed = 0;
    while (this.history.length && removed < 2) {
      const move = this.history.pop();
      this.board[move.y][move.x] = EMPTY;
      removed += 1;
      if (move.player === BLACK) break;
    }
    this.turn = BLACK;
    this.help.textContent = '轮到你落子';
    this.render();
    playSound('undo');
  }

  render() {
    const last = this.history[this.history.length - 1];
    for (const entry of this.cells) {
      const value = this.board[entry.y][entry.x];
      entry.el.className = 'gomoku-cell';
      entry.el.replaceChildren();
      if (value !== EMPTY) {
        entry.el.appendChild(el('span', `gomoku-stone ${value === BLACK ? 'is-black' : 'is-white'}`));
        entry.el.classList.add('is-filled');
      }
      if (last && last.x === entry.x && last.y === entry.y) entry.el.classList.add('is-last');
    }
    this.youPill.textContent = String(this.history.filter((m) => m.player === BLACK).length);
    this.aiPill.textContent = String(this.history.filter((m) => m.player === WHITE).length);
  }

  openDifficulties() {
    showOverlay({
      kicker: 'DIFFICULTY', title: 'AI 难度', theme: 'mini-theme',
      description: '简单模式会偶尔走随意的一步，普通模式会主动进攻和防守。',
      html: `<div class="ms-diffs">
        <button class="ms-diff ${this.difficulty === 'easy' ? 'is-current' : ''}" type="button" data-diff="easy"><strong>简单</strong><span>偶尔失误</span></button>
        <button class="ms-diff ${this.difficulty === 'normal' ? 'is-current' : ''}" type="button" data-diff="normal"><strong>普通</strong><span>会堵会攻</span></button>
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
