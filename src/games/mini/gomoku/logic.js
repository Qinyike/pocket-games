/** 五子棋：15×15，黑棋先手，白棋 AI。 */

export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function createBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

export function checkWinner(board, x, y, player) {
  for (const [dx, dy] of DIRECTIONS) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (inBounds(nx, ny) && board[ny][nx] === player) {
        count += 1;
        nx += dx * sign;
        ny += dy * sign;
      }
    }
    if (count >= 5) return player;
  }
  return 0;
}

export function isFull(board) {
  return board.every((row) => row.every((cell) => cell !== EMPTY));
}

function lineInfo(board, x, y, player, dx, dy) {
  let count = 1;
  let openEnds = 0;
  for (const sign of [-1, 1]) {
    let nx = x + dx * sign;
    let ny = y + dy * sign;
    while (inBounds(nx, ny) && board[ny][nx] === player) {
      count += 1;
      nx += dx * sign;
      ny += dy * sign;
    }
    if (inBounds(nx, ny) && board[ny][nx] === EMPTY) openEnds += 1;
  }
  return { count, openEnds };
}

function patternScore(count, openEnds) {
  if (count >= 5) return 10_000_000;
  if (count === 4 && openEnds === 2) return 1_000_000;
  if (count === 4 && openEnds === 1) return 120_000;
  if (count === 3 && openEnds === 2) return 15_000;
  if (count === 3 && openEnds === 1) return 900;
  if (count === 2 && openEnds === 2) return 180;
  if (count === 2 && openEnds === 1) return 30;
  if (count === 1 && openEnds === 2) return 6;
  return 1;
}

function positionScore(board, x, y, player) {
  return DIRECTIONS.reduce((sum, [dx, dy]) => {
    const { count, openEnds } = lineInfo(board, x, y, player, dx, dy);
    return sum + patternScore(count, openEnds);
  }, 0);
}

function candidates(board) {
  const result = [];
  const seen = new Set();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (board[y][x] === EMPTY) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          const key = `${nx},${ny}`;
          if (!inBounds(nx, ny) || board[ny][nx] !== EMPTY || seen.has(key)) continue;
          seen.add(key);
          result.push({ x: nx, y: ny });
        }
      }
    }
  }
  return result.length ? result : [{ x: 7, y: 7 }];
}

export function chooseMove(board, ai = WHITE, human = BLACK, difficulty = 'normal', rng = Math.random) {
  const moves = candidates(board);
  if (difficulty === 'easy' && rng() < 0.35) {
    return moves[Math.floor(rng() * moves.length)];
  }
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    board[move.y][move.x] = ai;
    const win = checkWinner(board, move.x, move.y, ai) === ai;
    const attack = positionScore(board, move.x, move.y, ai);
    board[move.y][move.x] = EMPTY;

    board[move.y][move.x] = human;
    const block = positionScore(board, move.x, move.y, human);
    const humanWin = checkWinner(board, move.x, move.y, human) === human;
    board[move.y][move.x] = EMPTY;

    let score = attack * 1.08 + block + 12 - (Math.abs(move.x - 7) + Math.abs(move.y - 7));
    if (win) score += 1e9;
    if (humanWin) score += 5e8;
    score += rng() * 20;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
