import { LEVELS } from './levels.js';
import {
  parseLevel,
  createGame,
  move,
  undo,
  reset,
  canUndo,
  hasSimpleDeadlock,
  keyOf,
} from './logic.js';
import {
  state as progress,
  completeSokobanLevel,
  sokobanBest,
  sokobanCompletedCount,
  setLastLevel,
} from '../../core/storage.js';
import { playSound } from '../../core/sound.js';
import { vibrate } from '../../core/haptics.js';
import { showOverlay, hideOverlay, toast, isOverlayOpen } from '../../core/ui.js';

const KEY_TO_DIR = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  w: 'up',
  d: 'right',
  s: 'down',
  a: 'left',
  W: 'up',
  D: 'right',
  S: 'down',
  A: 'left',
};

function cellTransform(cell) {
  const [x, y] = cell.split(',').map(Number);
  return `translate3d(${x * 100}%, ${y * 100}%, 0)`;
}

export class SokobanGame {
  constructor({ onExit, onProgressChange } = {}) {
    this.onExit = onExit || (() => {});
    this.onProgressChange = onProgressChange || (() => {});
    this.active = false;
    this.level = null;
    this.state = null;
    this.levelIndex = 0;
    this.boxEls = [];
    this.playerEl = null;
    this.winTimer = 0;
    this.deadlockWarned = false;

    this.screen = document.getElementById('screen-sokoban');
    this.board = document.getElementById('sokoban-board');
    this.boardWrap = document.getElementById('sokoban-board-wrap');
    this.movesEl = document.getElementById('sokoban-moves');
    this.pushesEl = document.getElementById('sokoban-pushes');
    this.bestEl = document.getElementById('sokoban-best');
    this.nameEl = document.getElementById('sokoban-level-name');
    this.hintEl = document.getElementById('sokoban-hint');
    this.undoBtn = document.getElementById('sokoban-undo');
    this.restartBtn = document.getElementById('sokoban-restart');
    this.levelsBtn = document.getElementById('sokoban-levels');

    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.bind();
  }

  bind() {
    this.screen.querySelectorAll('[data-action="home"]').forEach((button) => {
      button.addEventListener('click', () => this.onExit());
    });

    this.undoBtn.addEventListener('click', () => this.undoMove());
    this.restartBtn.addEventListener('click', () => this.restartLevel());
    this.levelsBtn.addEventListener('click', () => this.openLevelSelect());

    this.screen.querySelectorAll('.dpad-btn').forEach((button) => {
      const direction = button.dataset.dir;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.classList.add('is-pressed');
        this.tryMove(direction);
      });
      const release = () => button.classList.remove('is-pressed');
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    });

    let touchStart = null;
    this.board.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    this.board.addEventListener('pointerup', (event) => {
      if (!touchStart || event.pointerId !== touchStart.id) return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      touchStart = null;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < 18) return;
      if (ax > ay) this.tryMove(dx > 0 ? 'right' : 'left');
      else this.tryMove(dy > 0 ? 'down' : 'up');
    });
    this.board.addEventListener('pointercancel', () => {
      touchStart = null;
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.boardWrap);
  }

  start(levelId) {
    if (!this.active) {
      this.active = true;
      document.addEventListener('keydown', this.handleKeydown);
      window.addEventListener('resize', this.handleResize);
      window.addEventListener('orientationchange', this.handleResize);
    }
    const requested = Number(levelId);
    const index = LEVELS.findIndex((level) => level.id === requested);
    this.loadLevel(LEVELS[index >= 0 ? index : Math.max(0, (progress.sokoban.lastLevel || 1) - 1)]);
  }

  stop() {
    this.active = false;
    document.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.clearTimeout(this.winTimer);
    this.board.classList.remove('is-won');
    if (isOverlayOpen()) hideOverlay();
  }

  handleKeydown(event) {
    if (!this.active || isOverlayOpen()) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      this.undoMove();
      return;
    }
    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      this.restartLevel();
      return;
    }
    const direction = KEY_TO_DIR[event.key];
    if (!direction) return;
    event.preventDefault();
    this.tryMove(direction);
  }

  loadLevel(levelDef) {
    window.clearTimeout(this.winTimer);
    hideOverlay();
    this.levelIndex = LEVELS.findIndex((item) => item.id === levelDef.id);
    if (this.levelIndex < 0) this.levelIndex = 0;
    this.level = parseLevel(LEVELS[this.levelIndex]);
    this.state = createGame(this.level);
    this.deadlockWarned = false;
    this.board.classList.remove('is-won');
    this.board.style.setProperty('--cols', this.level.cols);
    this.board.style.setProperty('--rows', this.level.rows);
    this.nameEl.textContent = `第 ${this.level.id} 关 · ${this.level.name}`;
    this.hintEl.textContent = this.level.hint;
    this.buildBoard();
    this.updateHud();
    setLastLevel(this.level.id);
    this.handleResize();

    const best = sokobanBest(this.level.id);
    this.bestEl.textContent = best ? String(best.moves) : '—';
    this.undoBtn.disabled = true;
  }

  buildBoard() {
    const { cols, rows, walls, goals } = this.level;
    const grid = document.createElement('div');
    grid.className = 'board-grid';
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--rows', rows);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const key = keyOf(x, y);
        const tile = document.createElement('div');
        const isWall = walls.has(key);
        const isGoal = goals.has(key);
        tile.className = `tile ${isWall ? 'wall' : 'floor'}${!isWall && (x + y) % 2 === 1 ? ' alt' : ''}${isGoal ? ' goal' : ''}`;
        grid.appendChild(tile);
      }
    }

    const entities = document.createElement('div');
    entities.className = 'board-entities';
    this.boxEls = [];
    for (const cell of this.state.boxes) {
      const box = document.createElement('div');
      box.className = 'entity crate';
      box.style.transform = cellTransform(cell);
      const inner = document.createElement('div');
      inner.className = 'entity-inner';
      box.appendChild(inner);
      entities.appendChild(box);
      this.boxEls.push({ cell, el: box });
    }
    this.updateBoxGoals();

    this.playerEl = document.createElement('div');
    this.playerEl.className = 'entity player facing-down';
    this.playerEl.style.transform = cellTransform(keyOf(this.state.player.x, this.state.player.y));
    this.playerEl.innerHTML = `
      <div class="entity-inner">
        <span class="cap"></span>
        <span class="eye left"></span>
        <span class="eye right"></span>
      </div>
    `;
    entities.appendChild(this.playerEl);

    this.board.replaceChildren(grid, entities);
  }

  updateBoxGoals() {
    if (!this.state) return;
    for (const box of this.boxEls) {
      box.el.classList.toggle('on-goal', this.state.level.goals.has(box.cell));
    }
  }

  updateHud() {
    this.movesEl.textContent = String(this.state.moves);
    this.pushesEl.textContent = String(this.state.pushes);
    this.undoBtn.disabled = !canUndo(this.state);
  }

  updateEntities(event) {
    if (event.pushed) {
      const box = this.boxEls.find((entry) => entry.cell === event.box.from);
      if (box) {
        box.cell = event.box.to;
        box.el.style.transform = cellTransform(event.box.to);
        box.el.classList.toggle('on-goal', this.level.goals.has(event.box.to));
      } else {
        this.rebuildEntities();
      }
    }

    const playerKey = keyOf(this.state.player.x, this.state.player.y);
    this.playerEl.style.transform = cellTransform(playerKey);
    this.playerEl.classList.remove('facing-up', 'facing-down', 'facing-left', 'facing-right');
    this.playerEl.classList.add(`facing-${this.state.facing}`);
    this.playerEl.classList.remove('is-moving');
    void this.playerEl.offsetWidth;
    this.playerEl.classList.add('is-moving');
  }

  rebuildEntities() {
    const entities = this.board.querySelector('.board-entities');
    if (!entities || !this.state) return;
    entities.querySelectorAll('.crate').forEach((el) => el.remove());
    this.boxEls = [];
    const playerEl = this.playerEl;
    for (const cell of this.state.boxes) {
      const box = document.createElement('div');
      box.className = 'entity crate';
      box.style.transform = cellTransform(cell);
      box.innerHTML = '<div class="entity-inner"></div>';
      entities.insertBefore(box, playerEl);
      this.boxEls.push({ cell, el: box });
    }
    this.updateBoxGoals();
    if (playerEl) {
      playerEl.style.transform = cellTransform(keyOf(this.state.player.x, this.state.player.y));
    }
  }

  tryMove(direction) {
    if (!this.active || !this.state || this.state.won || isOverlayOpen()) return;
    const event = move(this.state, direction);
    if (!event.moved) {
      if (event.reason !== 'won') {
        playSound('blocked');
      }
      return;
    }

    this.updateEntities(event);
    this.updateHud();

    if (event.pushed) {
      playSound('push');
      vibrate(12);
      if (event.onGoal) {
        playSound('goal');
        vibrate([10, 40, 16]);
      }
    } else {
      playSound('move');
      vibrate(6);
    }

    if (event.won) {
      this.handleWin();
      return;
    }

    if (event.pushed && !this.deadlockWarned && hasSimpleDeadlock(this.state)) {
      this.deadlockWarned = true;
      toast('这个箱子卡在角落了，撤销一步试试');
    }
  }

  handleWin() {
    this.board.classList.add('is-won');
    playSound('win');
    vibrate([18, 60, 24, 60, 40]);
    const { firstClear, newBest } = completeSokobanLevel(
      this.level.id,
      this.state.moves,
      this.state.pushes,
    );
    const best = sokobanBest(this.level.id);
    this.bestEl.textContent = best ? String(best.moves) : String(this.state.moves);
    this.onProgressChange();

    this.winTimer = window.setTimeout(() => {
      if (!this.active) return;
      const index = this.levelIndex;
      const next = LEVELS[index + 1];
      const isLast = !next;
      const actions = [];
      if (next) {
        actions.push({
          label: `下一关 · ${next.name}`,
          kind: 'primary',
          onClick: () => this.loadLevel(next),
        });
      } else {
        actions.push({
          label: '回到第一关',
          kind: 'primary',
          onClick: () => this.loadLevel(LEVELS[0]),
        });
      }
      actions.push({ label: '再玩一次', onClick: () => this.loadLevel(LEVELS[index]) });
      actions.push({
        label: '选择关卡',
        onClick: () => {
          this.openLevelSelect();
          return false;
        },
      });

      showOverlay({
        kicker: isLast ? 'ALL CLEAR' : 'LEVEL CLEAR',
        title: isLast ? '全部通关！' : `第 ${this.level.id} 关完成`,
        description: isLast
          ? '仓库已经全部整理完毕。要不要从头再挑战一次最佳步数？'
          : newBest
            ? firstClear
              ? '第一次通关，已经记下你的最佳步数。'
              : '刷新了本关的最佳步数，干得漂亮。'
            : '箱子都归位了。换一条路线，也许还能少走几步。',
        stats: [
          ['步数', String(this.state.moves)],
          ['推动', String(this.state.pushes)],
          ['最佳', newBest ? `${this.state.moves} 步` : `${best.moves} 步`],
        ],
        actions,
      });
    }, 720);
  }

  undoMove() {
    if (!this.active || !this.state || isOverlayOpen()) return;
    if (!undo(this.state)) return;
    this.deadlockWarned = false;
    this.board.classList.remove('is-won');
    this.rebuildEntities();
    this.playerEl?.classList.remove('is-moving');
    this.updateHud();
    playSound('undo');
    vibrate(5);
  }

  restartLevel() {
    if (!this.active || !this.state) return;
    reset(this.state);
    this.deadlockWarned = false;
    this.board.classList.remove('is-won');
    this.rebuildEntities();
    this.updateHud();
    this.playerEl?.classList.remove('is-moving');
    playSound('undo');
  }

  openLevelSelect() {
    if (!this.active) return;
    const completed = sokobanCompletedCount();
    const buttons = LEVELS.map((level) => {
      const best = sokobanBest(level.id);
      const classes = [
        'level-btn',
        best ? 'is-done' : '',
        level.id === this.level?.id ? 'is-current' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${classes}" type="button" data-level="${level.id}" aria-label="第 ${level.id} 关 ${level.name}${best ? '，已通关' : ''}">
          ${level.id}
          <small>${best ? `${best.moves} 步` : level.difficulty}</small>
        </button>
      `;
    }).join('');

    showOverlay({
      kicker: 'LEVEL SELECT',
      title: '选择关卡',
      description: `已通关 ${completed} / ${LEVELS.length} 关。所有关卡都已解锁，随时可以回来刷步数。`,
      html: `<div class="level-grid">${buttons}</div>`,
      dismissible: true,
      onMount: (card) => {
        card.querySelectorAll('[data-level]').forEach((button) => {
          button.addEventListener('click', () => {
            const level = LEVELS.find((item) => item.id === Number(button.dataset.level));
            if (level) {
              hideOverlay();
              this.loadLevel(level);
            }
          });
        });
      },
    });
  }

  handleResize() {
    if (!this.level || !this.boardWrap) return;
    const rect = this.boardWrap.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const maxWidth = rect.width - 4;
    const maxHeight = rect.height - 4;
    const cell = Math.min(maxWidth / this.level.cols, maxHeight / this.level.rows, 64);
    const width = Math.floor(cell * this.level.cols);
    const height = Math.floor(cell * this.level.rows);
    this.board.style.width = `${width}px`;
    this.board.style.height = `${height}px`;
  }
}
