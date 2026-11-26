/**
 * 2048 的纯逻辑：移动、合并、生成、胜负判断。
 * 棋盘是 4x4 的二维数组，0 表示空格。
 */

export const SIZE = 4;

export function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function spawnTile(board, rng = Math.random) {
  const empty = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (board[y][x] === 0) empty.push({ x, y });
    }
  }
  if (empty.length === 0) return null;
  const spot = empty[Math.floor(rng() * empty.length)];
  board[spot.y][spot.x] = rng() < 0.9 ? 2 : 4;
  return spot;
}

export function createBoard(rng = Math.random) {
  const board = createEmptyBoard();
  spawnTile(board, rng);
  spawnTile(board, rng);
  return board;
}

export function hasValue(board, value) {
  return board.some((row) => row.some((cell) => cell >= value));
}

export function canMove(board) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (board[y][x] === 0) return true;
      if (x + 1 < SIZE && board[y][x] === board[y][x + 1]) return true;
      if (y + 1 < SIZE && board[y][x] === board[y + 1][x]) return true;
    }
  }
  return false;
}

function slideLine(line) {
  const values = line.filter((value) => value !== 0);
  const result = [];
  let gained = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < values.length && values[i] === values[i + 1]) {
      const merged = values[i] * 2;
      result.push(merged);
      gained += merged;
      i += 1;
    } else {
      result.push(values[i]);
    }
  }
  while (result.length < SIZE) result.push(0);
  return { line: result, gained };
}

/**
 * @param {number[][]} board
 * @param {'up'|'down'|'left'|'right'} direction
 * @returns {{board: number[][], moved: boolean, gained: number}}
 */
export function move(board, direction) {
  const next = createEmptyBoard();
  let moved = false;
  let gained = 0;

  for (let index = 0; index < SIZE; index += 1) {
    let line;
    if (direction === 'left' || direction === 'right') {
      line = board[index].slice();
      if (direction === 'right') line.reverse();
    } else {
      line = Array.from({ length: SIZE }, (_, row) => board[row][index]);
      if (direction === 'down') line.reverse();
    }

    const result = slideLine(line);
    gained += result.gained;
    let out = result.line;
    if (direction === 'right' || direction === 'down') out = out.slice().reverse();

    for (let i = 0; i < SIZE; i += 1) {
      if (direction === 'left' || direction === 'right') next[index][i] = out[i];
      else next[i][index] = out[i];
    }

    const original = direction === 'left' || direction === 'right'
      ? board[index]
      : Array.from({ length: SIZE }, (_, row) => board[row][index]);
    if (out.some((value, i) => value !== (direction === 'right' || direction === 'down' ? original[SIZE - 1 - i] : original[i]))) {
      moved = true;
    }
  }

  // 上面的逐格比较在合并时会比较到新值；直接比较棋盘更可靠。
  moved = next.some((row, y) => row.some((value, x) => value !== board[y][x]));
  return { board: next, moved, gained };
}

export function bestTile(board) {
  return Math.max(...board.flat());
}
