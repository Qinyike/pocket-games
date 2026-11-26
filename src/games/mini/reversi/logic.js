/** 黑白棋（Reversi）8×8。 */

export const SIZE = 8;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function createBoard() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  return board;
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

export function flipsFor(board, x, y, player) {
  if (!inBounds(x, y) || board[y][x] !== EMPTY) return [];
  const opponent = player === BLACK ? WHITE : BLACK;
  const result = [];
  for (const [dx, dy] of DIRS) {
    const line = [];
    let nx = x + dx;
    let ny = y + dy;
    while (inBounds(nx, ny) && board[ny][nx] === opponent) {
      line.push({ x: nx, y: ny });
      nx += dx;
      ny += dy;
    }
    if (line.length && inBounds(nx, ny) && board[ny][nx] === player) result.push(...line);
  }
  return result;
}

export function legalMoves(board, player) {
  const moves = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const flips = flipsFor(board, x, y, player);
      if (flips.length) moves.push({ x, y, flips });
    }
  }
  return moves;
}

export function place(board, x, y, player) {
  const flips = flipsFor(board, x, y, player);
  if (!flips.length) return [];
  board[y][x] = player;
  for (const cell of flips) board[cell.y][cell.x] = player;
  return flips;
}

export function countDiscs(board) {
  let black = 0;
  let white = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === BLACK) black += 1;
      else if (cell === WHITE) white += 1;
    }
  }
  return { black, white };
}

const WEIGHTS = [
  [100, -20, 10, 5, 5, 10, -20, 100],
  [-20, -50, -2, -2, -2, -2, -50, -20],
  [10, -2, 1, 1, 1, 1, -2, 10],
  [5, -2, 1, 0, 0, 1, -2, 5],
  [5, -2, 1, 0, 0, 1, -2, 5],
  [10, -2, 1, 1, 1, 1, -2, 10],
  [-20, -50, -2, -2, -2, -2, -50, -20],
  [100, -20, 10, 5, 5, 10, -20, 100],
];

export function chooseMove(board, player, difficulty = 'normal', rng = Math.random) {
  const moves = legalMoves(board, player);
  if (!moves.length) return null;
  if (difficulty === 'easy' && rng() < 0.35) {
    return moves[Math.floor(rng() * moves.length)];
  }
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    let score = WEIGHTS[move.y][move.x] + move.flips.length * 2;
    if (difficulty === 'easy') score += rng() * 40;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
