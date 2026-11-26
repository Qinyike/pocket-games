/**
 * 扫雷纯逻辑：首击安全、洪水展开、旗帜、胜负。
 */

export const DIFFICULTIES = {
  easy: { label: '初级', cols: 9, rows: 9, mines: 10 },
  medium: { label: '中级', cols: 12, rows: 12, mines: 22 },
  hard: { label: '高级', cols: 14, rows: 14, mines: 32 },
};

export class MinesweeperGame {
  constructor(difficulty = 'easy', rng = Math.random) {
    this.config = DIFFICULTIES[difficulty] || DIFFICULTIES.easy;
    this.difficulty = difficulty in DIFFICULTIES ? difficulty : 'easy';
    this.rng = rng;
    this.reset();
  }

  reset() {
    const { rows, cols } = this.config;
    this.board = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        mine: false,
        revealed: false,
        flagged: false,
        adjacent: 0,
      })),
    );
    this.status = 'ready';
    this.startedAt = null;
    this.finishedAt = null;
    this.revealedCount = 0;
    this.flags = 0;
    this.minesPlaced = false;
    this.lastReveal = null;
  }

  get totalSafe() {
    return this.config.cols * this.config.rows - this.config.mines;
  }

  get remainingMines() {
    return this.config.mines - this.flags;
  }

  neighbors(x, y) {
    const result = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.config.cols && ny < this.config.rows) {
          result.push({ x: nx, y: ny });
        }
      }
    }
    return result;
  }

  placeMines(safeX, safeY) {
    const forbidden = new Set([`${safeX},${safeY}`]);
    for (const n of this.neighbors(safeX, safeY)) forbidden.add(`${n.x},${n.y}`);
    const candidates = [];
    for (let y = 0; y < this.config.rows; y += 1) {
      for (let x = 0; x < this.config.cols; x += 1) {
        if (!forbidden.has(`${x},${y}`)) candidates.push({ x, y });
      }
    }
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const cell of candidates.slice(0, this.config.mines)) {
      this.board[cell.y][cell.x].mine = true;
    }
    for (let y = 0; y < this.config.rows; y += 1) {
      for (let x = 0; x < this.config.cols; x += 1) {
        this.board[y][x].adjacent = this.neighbors(x, y).filter(
          (n) => this.board[n.y][n.x].mine,
        ).length;
      }
    }
    this.minesPlaced = true;
  }

  startClock() {
    if (this.status === 'ready') {
      this.status = 'playing';
      this.startedAt = Date.now();
    }
  }

  reveal(x, y) {
    if (this.status === 'won' || this.status === 'lost') return { changed: false };
    const cell = this.board[y]?.[x];
    if (!cell || cell.revealed || cell.flagged) return { changed: false };
    if (!this.minesPlaced) {
      this.placeMines(x, y);
      this.startClock();
    }

    if (cell.mine) {
      cell.revealed = true;
      this.status = 'lost';
      this.finishedAt = Date.now();
      this.revealAllMines();
      return { changed: true, lost: true };
    }

    this.floodReveal(x, y);
    this.lastReveal = { x, y };
    const won = this.revealedCount >= this.totalSafe;
    if (won) {
      this.status = 'won';
      this.finishedAt = Date.now();
      for (const row of this.board) {
        for (const item of row) {
          if (item.mine) item.flagged = true;
        }
      }
    }
    return { changed: true, won };
  }

  floodReveal(x, y) {
    const stack = [{ x, y }];
    while (stack.length) {
      const point = stack.pop();
      const cell = this.board[point.y][point.x];
      if (cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      this.revealedCount += 1;
      if (cell.adjacent === 0) {
        for (const n of this.neighbors(point.x, point.y)) {
          const next = this.board[n.y][n.x];
          if (!next.revealed && !next.flagged && !next.mine) stack.push(n);
        }
      }
    }
  }

  revealAllMines() {
    for (const row of this.board) {
      for (const cell of row) {
        if (cell.mine) cell.revealed = true;
      }
    }
  }

  toggleFlag(x, y) {
    if (this.status === 'won' || this.status === 'lost') return false;
    const cell = this.board[y]?.[x];
    if (!cell || cell.revealed) return false;
    if (!cell.flagged && this.flags >= this.config.mines) return false;
    cell.flagged = !cell.flagged;
    this.flags += cell.flagged ? 1 : -1;
    return true;
  }

  get elapsed() {
    if (!this.startedAt) return 0;
    return ((this.finishedAt || Date.now()) - this.startedAt) / 1000;
  }
}
