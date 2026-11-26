/**
 * 俄罗斯方块核心引擎（纯逻辑，不依赖 DOM）。
 *
 * 采用 Guideline 常见规则：
 * - 7-bag 随机
 * - SRS 旋转 + 墙踢
 * - 暂存（每个方块一次）
 * - 幽灵方块
 * - 消行计分、连击、每 10 行升一级
 */

export const COLS = 10;
export const ROWS = 20;

export const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

export const COLORS = {
  I: '#4bdcff',
  J: '#5f8cff',
  L: '#ffab4d',
  O: '#ffd84d',
  S: '#61e39b',
  T: '#bd8bff',
  Z: '#ff7188',
};

const BASE_SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

function rotateCW(matrix) {
  const size = matrix.length;
  const result = Array.from({ length: size }, () => Array(size).fill(0));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      result[x][size - 1 - y] = matrix[y][x];
    }
  }
  return result;
}

/** 四种朝向的方块矩阵，索引 0=出生，1=右转，2=半圈，3=左转。 */
export const SHAPES = Object.fromEntries(
  Object.entries(BASE_SHAPES).map(([type, base]) => {
    const states = [base];
    for (let i = 1; i < 4; i += 1) states.push(rotateCW(states[i - 1]));
    return [type, states];
  }),
);

// 屏幕坐标系：x 向右，y 向下。
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

const LINE_SCORES = [0, 100, 300, 500, 800];

function topOffset(matrix) {
  for (let y = 0; y < matrix.length; y += 1) {
    if (matrix[y].some((value) => value)) return y;
  }
  return 0;
}

function makeEmptyBoard(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

function shuffledBag(rng) {
  const bag = TYPES.slice();
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export class TetrisEngine {
  constructor({ cols = COLS, rows = ROWS, rng = Math.random, nextCount = 5 } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.rng = rng;
    this.nextCount = nextCount;
    this.reset();
  }

  reset() {
    this.board = makeEmptyBoard(this.cols, this.rows);
    this.bag = [];
    this.queue = [];
    this.holdType = null;
    this.canHold = true;
    this.active = null;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.gameOver = false;
    this.lastClear = 0;
    this.fillQueue();
    this.spawnNext();
  }

  fillQueue() {
    while (this.queue.length < this.nextCount) {
      if (this.bag.length === 0) this.bag = shuffledBag(this.rng);
      this.queue.push(this.bag.pop());
    }
  }

  get nextPieces() {
    return this.queue.slice(0, Math.min(3, this.queue.length));
  }

  matrixFor(type, rotation) {
    return SHAPES[type][((rotation % 4) + 4) % 4];
  }

  spawnType(type) {
    const matrix = this.matrixFor(type, 0);
    const size = matrix.length;
    const x = Math.floor((this.cols - size) / 2);
    const y = -topOffset(matrix);
    const active = {
      type,
      rotation: 0,
      x,
      y,
      matrix,
    };
    this.active = active;
    if (this.collides(matrix, x, y)) {
      this.gameOver = true;
    }
    return active;
  }

  spawnNext() {
    this.fillQueue();
    const type = this.queue.shift();
    this.spawnType(type);
    this.fillQueue();
    return this.active;
  }

  collides(matrix, x, y) {
    for (let sy = 0; sy < matrix.length; sy += 1) {
      for (let sx = 0; sx < matrix[sy].length; sx += 1) {
        if (!matrix[sy][sx]) continue;
        const bx = x + sx;
        const by = y + sy;
        if (bx < 0 || bx >= this.cols || by >= this.rows) return true;
        if (by < 0) continue;
        if (this.board[by][bx]) return true;
      }
    }
    return false;
  }

  move(dx, dy) {
    if (!this.active || this.gameOver) return false;
    const nextX = this.active.x + dx;
    const nextY = this.active.y + dy;
    if (this.collides(this.active.matrix, nextX, nextY)) return false;
    this.active.x = nextX;
    this.active.y = nextY;
    return true;
  }

  rotate(direction = 1) {
    if (!this.active || this.gameOver) return false;
    const from = this.active.rotation;
    const to = (from + (direction >= 0 ? 1 : 3)) % 4;
    const matrix = this.matrixFor(this.active.type, to);
    const kicks =
      this.active.type === 'O'
        ? [[0, 0]]
        : this.active.type === 'I'
          ? KICKS_I[`${from}>${to}`]
          : KICKS_JLSTZ[`${from}>${to}`];
    if (!kicks) return false;

    for (const [dx, dy] of kicks) {
      if (!this.collides(matrix, this.active.x + dx, this.active.y + dy)) {
        this.active.rotation = to;
        this.active.matrix = matrix;
        this.active.x += dx;
        this.active.y += dy;
        return true;
      }
    }
    return false;
  }

  softDrop() {
    if (!this.move(0, 1)) return false;
    this.score += 1;
    return true;
  }

  ghostY() {
    if (!this.active) return 0;
    let y = this.active.y;
    while (!this.collides(this.active.matrix, this.active.x, y + 1)) {
      y += 1;
    }
    return y;
  }

  hardDrop() {
    if (!this.active || this.gameOver) return { dropped: 0, locked: false };
    let dropped = 0;
    while (this.move(0, 1)) dropped += 1;
    this.score += dropped * 2;
    const result = this.lock();
    return { dropped, locked: true, ...result };
  }

  hold() {
    if (!this.active || this.gameOver || !this.canHold) return false;
    const currentType = this.active.type;
    const held = this.holdType;
    this.holdType = currentType;
    this.canHold = false;
    if (held) {
      this.spawnType(held);
    } else {
      this.spawnNext();
    }
    this.fillQueue();
    return true;
  }

  lock() {
    if (!this.active || this.gameOver) return null;
    const { matrix, x, y, type } = this.active;
    let topOut = false;

    for (let sy = 0; sy < matrix.length; sy += 1) {
      for (let sx = 0; sx < matrix[sy].length; sx += 1) {
        if (!matrix[sy][sx]) continue;
        const bx = x + sx;
        const by = y + sy;
        if (by < 0) {
          topOut = true;
          continue;
        }
        this.board[by][bx] = type;
      }
    }

    const clearedRows = [];
    for (let row = 0; row < this.rows; row += 1) {
      if (this.board[row].every((cell) => cell !== null)) {
        clearedRows.push(row);
      }
    }

    let scoreGain = 0;
    let perfectClear = false;
    if (clearedRows.length > 0) {
      this.combo += 1;
      const levelBefore = this.level;
      scoreGain = LINE_SCORES[clearedRows.length] * levelBefore;
      if (this.combo > 0) {
        scoreGain += 50 * this.combo * levelBefore;
      }
      this.score += scoreGain;
      for (const row of clearedRows.sort((a, b) => b - a)) {
        this.board.splice(row, 1);
        this.board.unshift(Array(this.cols).fill(null));
      }
      this.lines += clearedRows.length;
      this.level = Math.min(20, Math.floor(this.lines / 10) + 1);
      perfectClear = this.board.every((row) => row.every((cell) => cell === null));
      if (perfectClear) {
        this.score += 500 * this.level;
      }
    } else {
      this.combo = -1;
    }

    this.lastClear = clearedRows.length;
    this.active = null;
    if (topOut) this.gameOver = true;

    if (!this.gameOver) {
      this.canHold = true;
      this.spawnNext();
    }

    return {
      cleared: clearedRows.length,
      clearedRows,
      scoreGain,
      combo: this.combo,
      perfectClear,
      level: this.level,
      topOut,
      gameOver: this.gameOver,
    };
  }

  get inactiveCells() {
    const cells = [];
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (this.board[y][x]) cells.push({ x, y, type: this.board[y][x] });
      }
    }
    return cells;
  }

  get ghostCells() {
    if (!this.active) return [];
    const ghostY = this.ghostY();
    const cells = [];
    const { matrix, x } = this.active;
    for (let sy = 0; sy < matrix.length; sy += 1) {
      for (let sx = 0; sx < matrix[sy].length; sx += 1) {
        if (!matrix[sy][sx]) continue;
        const by = ghostY + sy;
        if (by >= 0) cells.push({ x: x + sx, y: by, type: this.active.type });
      }
    }
    return cells;
  }

  get activeCells() {
    if (!this.active) return [];
    const cells = [];
    const { matrix, x, y, type } = this.active;
    for (let sy = 0; sy < matrix.length; sy += 1) {
      for (let sx = 0; sx < matrix[sy].length; sx += 1) {
        if (!matrix[sy][sx]) continue;
        if (y + sy >= 0) cells.push({ x: x + sx, y: y + sy, type });
      }
    }
    return cells;
  }

  get gravityMs() {
    const level = this.level;
    const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
    return Math.max(35, Math.round(seconds * 1000));
  }

  get isGrounded() {
    if (!this.active) return false;
    return this.collides(this.active.matrix, this.active.x, this.active.y + 1);
  }
}
