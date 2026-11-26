import {
  SIZE, DIFFICULTIES, clone, generatePuzzle, isValid,
} from './logic.js';
import { miniState, updateMini } from '../../../core/storage.js';
import { playSound, startMusic } from '../../../core/sound.js';
import { vibrate } from '../../../core/haptics.js';
import { showOverlay, hideOverlay, isOverlayOpen } from '../../../core/ui.js';
import { el, hudPill, button, formatTime } from '../shared.js';

export class SudokuGame {
  constructor({ stage, hud, controls, help, onExit, onProgressChange }) {
    this.stage = stage; this.hud = hud; this.controls = controls; this.help = help;
    this.onExit = onExit; this.onProgressChange = onProgressChange;
    this.difficulty = miniState('sudoku').lastDifficulty || 'easy';
    this.selected = null;
    this.notesMode = false;
    this.timer = 0;
    this.generateTimer = 0;
    this.ready = false;
    this.destroyed = false;
    this.cleanup = [];
  }

  start() {
    startMusic('puzzle');
    this.help.textContent = '点格子后按数字键填入；开启笔记可记录候选数。';
    this.build();
    this.newGame(this.difficulty);
  }

  build() {
    this.hud.replaceChildren(
      hudPill('难度', '简单'), hudPill('用时', '0:00'), hudPill('完成', '0 局'),
      hudPill('最佳', '—'),
    );
    this.diffPill = this.hud.children[0].querySelector('strong');
    this.timePill = this.hud.children[1].querySelector('strong');
    this.donePill = this.hud.children[2].querySelector('strong');
    this.bestPill = this.hud.children[3].querySelector('strong');
    this.updateStats();

    this.boardEl = el('div', 'sudoku-board');
    this.boardEl.style.setProperty('--size', SIZE);
    this.cells = [];
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const cell = el('button', 'sudoku-cell');
        cell.type = 'button';
        cell.addEventListener('click', () => this.select(x, y));
        this.boardEl.appendChild(cell);
        this.cells.push({ x, y, el: cell });
      }
    }
    const wrap = el('div', 'sudoku-wrap');
    wrap.appendChild(this.boardEl);
    this.stage.replaceChildren(wrap);

    const pad = el('div', 'sudoku-pad');
    for (let value = 1; value <= 9; value += 1) {
      const num = button(String(value), { className: 'sudoku-num', onClick: () => this.input(value) });
      pad.appendChild(num);
    }
    this.notesBtn = button('笔记', { onClick: () => this.toggleNotes() });
    this.eraseBtn = button('擦除', { onClick: () => this.erase() });
    this.hintBtn = button('提示', { onClick: () => this.hint() });
    this.newBtn = button('新局', { className: 'is-primary', onClick: () => this.openDifficulties() });
    this.controls.replaceChildren(pad, this.notesBtn, this.eraseBtn, this.hintBtn, this.newBtn);

    this.cleanup.push(this.bindKeyboard());
    this.cleanup.push(() => window.clearInterval(this.timer));
  }

  bindKeyboard() {
    const listener = (event) => {
      if (isOverlayOpen()) return;
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key >= '1' && event.key <= '9') {
        this.input(Number(event.key));
        event.preventDefault();
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        this.erase();
        event.preventDefault();
      } else if (event.key === 'n' || event.key === 'N') {
        this.toggleNotes();
      } else if (event.key.startsWith('Arrow') && this.selected) {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        this.select(
          Math.max(0, Math.min(8, this.selected.x + delta[0])),
          Math.max(0, Math.min(8, this.selected.y + delta[1])),
        );
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }

  newGame(difficulty) {
    window.clearTimeout(this.generateTimer);
    this.ready = false;
    this.board = null;
    hideOverlay();
    window.clearInterval(this.timer);
    this.timer = 0;
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'easy';
    this.help.textContent = '正在生成唯一解…';
    this.stage.classList.add('is-loading');
    this.generateTimer = window.setTimeout(() => {
      if (this.destroyed || !this.boardEl) return;
      const generated = generatePuzzle(this.difficulty);
      this.puzzle = generated.puzzle;
      this.solution = generated.solution;
      this.board = clone(generated.puzzle);
      this.notes = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => new Set()));
      this.selected = null;
      this.notesMode = false;
      this.notesBtn.classList.remove('is-active');
      this.notesBtn.textContent = '笔记';
      this.over = false;
      this.ready = true;
      this.elapsed = 0;
      this.started = false;
      this.stage.classList.remove('is-loading');
      this.help.textContent = '点格子后按数字键填入；开启笔记可记录候选数。';
      updateMini('sudoku', (state) => { state.lastDifficulty = this.difficulty; });
      this.updateStats();
      this.render();
      this.syncHud();
      this.onProgressChange?.();
    }, 30);
  }

  updateStats() {
    const st = miniState('sudoku');
    const best = st.best?.[this.difficulty];
    this.donePill.textContent = `${st.completed || 0} 局`;
    this.bestPill.textContent = best ? formatTime(best) : '—';
    this.diffPill.textContent = DIFFICULTIES[this.difficulty].label;
  }

  select(x, y) {
    if (!this.ready) return;
    this.selected = { x, y };
    this.render();
  }

  startTimer() {
    if (this.started) return;
    this.started = true;
    this.timer = window.setInterval(() => {
      this.elapsed += 1;
      this.syncHud();
    }, 1000);
  }

  syncHud() {
    this.timePill.textContent = formatTime(this.elapsed);
    this.diffPill.textContent = DIFFICULTIES[this.difficulty].label;
    const st = miniState('sudoku');
    const best = st.best?.[this.difficulty];
    this.bestPill.textContent = best ? formatTime(best) : '—';
  }

  input(value) {
    if (!this.ready || this.over || !this.selected) return;
    if (isOverlayOpen()) return;
    const { x, y } = this.selected;
    if (this.puzzle[y][x] !== 0) return;
    this.startTimer();
    if (this.notesMode) {
      if (this.board[y][x] !== 0) return;
      if (this.notes[y][x].has(value)) this.notes[y][x].delete(value);
      else this.notes[y][x].add(value);
      playSound('tap');
    } else {
      if (this.board[y][x] === value) return;
      this.board[y][x] = value;
      this.notes[y][x].clear();
      if (value !== this.solution[y][x]) {
        playSound('error');
        vibrate(10);
      } else {
        playSound('digit');
        vibrate(4);
      }
    }
    this.render();
    this.checkComplete();
  }

  erase() {
    if (!this.ready || this.over || !this.selected) return;
    const { x, y } = this.selected;
    if (this.puzzle[y][x] !== 0) return;
    this.board[y][x] = 0;
    this.notes[y][x].clear();
    playSound('undo');
    this.render();
  }

  toggleNotes() {
    this.notesMode = !this.notesMode;
    this.notesBtn.classList.toggle('is-active', this.notesMode);
    this.notesBtn.textContent = this.notesMode ? '笔记中' : '笔记';
    playSound('tap');
  }

  hint() {
    if (!this.ready || this.over) return;
    let target = this.selected;
    if (!target || this.board[target.y][target.x] !== 0) {
      const empty = [];
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          if (this.board[y][x] === 0) empty.push({ x, y });
        }
      }
      target = empty[Math.floor(Math.random() * empty.length)];
    }
    if (!target) return;
    this.selected = target;
    this.board[target.y][target.x] = this.solution[target.y][target.x];
    this.notes[target.y][target.x].clear();
    playSound('hint');
    this.render();
    this.checkComplete();
  }

  conflictAt(x, y) {
    const value = this.board[y][x];
    if (!value) return false;
    return !isValid(this.board, y, x, value);
  }

  render() {
    if (!this.ready) return;
    const selected = this.selected;
    const selectedValue = selected ? this.board[selected.y][selected.x] : 0;
    for (const entry of this.cells) {
      const { x, y } = entry;
      const value = this.board[y][x];
      const given = this.puzzle[y][x] !== 0;
      entry.el.className = 'sudoku-cell';
      entry.el.replaceChildren();
      if (selected) {
        if (x === selected.x || y === selected.y) entry.el.classList.add('is-cross');
        if (Math.floor(x / 3) === Math.floor(selected.x / 3) && Math.floor(y / 3) === Math.floor(selected.y / 3)) {
          entry.el.classList.add('is-box');
        }
        if (x === selected.x && y === selected.y) entry.el.classList.add('is-selected');
        if (selectedValue && value === selectedValue) entry.el.classList.add('is-same');
      }
      if (given) entry.el.classList.add('is-given');
      if (value) {
        entry.el.appendChild(el('span', 'sudoku-value', String(value)));
        if (!given && this.conflictAt(x, y)) entry.el.classList.add('is-error');
      } else if (this.notes[y][x].size) {
        const notes = el('div', 'sudoku-notes');
        for (let n = 1; n <= 9; n += 1) {
          notes.appendChild(el('span', '', this.notes[y][x].has(n) ? String(n) : ''));
        }
        entry.el.appendChild(notes);
      }
    }
  }

  checkComplete() {
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (this.board[y][x] !== this.solution[y][x]) return;
      }
    }
    this.win();
  }

  win() {
    if (this.over) return;
    this.over = true;
    window.clearInterval(this.timer);
    const time = this.elapsed;
    const st = miniState('sudoku');
    const previous = st.best?.[this.difficulty] ?? null;
    const newBest = previous === null || time < previous;
    updateMini('sudoku', (state) => {
      state.completed = (state.completed || 0) + 1;
      state.best = state.best || {};
      if (state.best[this.difficulty] === null || state.best[this.difficulty] === undefined || time < state.best[this.difficulty]) {
        state.best[this.difficulty] = time;
      }
    });
    this.updateStats();
    this.onProgressChange?.();
    playSound('win');
    vibrate([16, 50, 24, 50, 40]);
    showOverlay({
      kicker: 'SOLVED',
      title: newBest ? '完成，新纪录！' : '完成！',
      theme: 'mini-theme',
      description: newBest ? '这个难度的时间纪录被你刷新了。' : '每一条逻辑都落在正确的位置。',
      stats: [
        ['难度', DIFFICULTIES[this.difficulty].label],
        ['用时', formatTime(time)],
        ['最佳', formatTime(Math.min(previous ?? Infinity, time))],
      ],
      dismissible: false,
      actions: [
        { label: '再来一局', kind: 'primary', onClick: () => { this.openDifficulties(); return false; } },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  openDifficulties() {
    const items = Object.entries(DIFFICULTIES).map(([key, config]) => `
      <button class="ms-diff ${key === this.difficulty ? 'is-current' : ''}" type="button" data-diff="${key}">
        <strong>${config.label}</strong><span>${config.clues} 个提示数</span>
      </button>
    `).join('');
    showOverlay({
      kicker: 'DIFFICULTY', title: '选择难度', theme: 'mini-theme',
      description: '每次都会生成新的唯一解题目。',
      html: `<div class="ms-diffs">${items}</div>`,
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
    this.destroyed = true;
    window.clearTimeout(this.generateTimer);
    window.clearInterval(this.timer);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    hideOverlay();
  }
}
