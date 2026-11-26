/**
 * 数独生成与求解。
 * 9×9，0 表示空格；生成器保证唯一解。
 */

export const SIZE = 9;
export const DIFFICULTIES = {
  easy: { label: '简单', clues: 40 },
  medium: { label: '中等', clues: 32 },
  hard: { label: '困难', clues: 26 },
};

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function clone(board) {
  return board.map((row) => row.slice());
}

export function isValid(board, row, col, value) {
  for (let i = 0; i < SIZE; i += 1) {
    if (board[row][i] === value && i !== col) return false;
    if (board[i][col] === value && i !== row) return false;
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let y = boxRow; y < boxRow + 3; y += 1) {
    for (let x = boxCol; x < boxCol + 3; x += 1) {
      if (board[y][x] === value && (y !== row || x !== col)) return false;
    }
  }
  return true;
}

function shuffled(values, rng) {
  const arr = values.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fill(board, rng) {
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] !== 0) continue;
      for (const value of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
        if (isValid(board, row, col, value)) {
          board[row][col] = value;
          if (fill(board, rng)) return true;
          board[row][col] = 0;
        }
      }
      return false;
    }
  }
  return true;
}

export function generateSolved(rng = Math.random) {
  const board = emptyBoard();
  fill(board, rng);
  return board;
}

function findBestEmpty(board) {
  let best = null;
  let bestOptions = 10;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] !== 0) continue;
      const options = [];
      for (let value = 1; value <= 9; value += 1) {
        if (isValid(board, row, col, value)) options.push(value);
      }
      if (options.length < bestOptions) {
        bestOptions = options.length;
        best = { row, col, options };
        if (bestOptions === 0) return best;
      }
    }
  }
  return best;
}

export function countSolutions(input, limit = 2) {
  const board = clone(input);
  let count = 0;
  function search() {
    if (count >= limit) return;
    const empty = findBestEmpty(board);
    if (!empty) {
      count += 1;
      return;
    }
    if (empty.options.length === 0) return;
    for (const value of empty.options) {
      board[empty.row][empty.col] = value;
      search();
      board[empty.row][empty.col] = 0;
      if (count >= limit) return;
    }
  }
  search();
  return count;
}

export function solve(input) {
  const board = clone(input);
  function search() {
    const empty = findBestEmpty(board);
    if (!empty) return true;
    if (empty.options.length === 0) return false;
    for (const value of empty.options) {
      board[empty.row][empty.col] = value;
      if (search()) return true;
      board[empty.row][empty.col] = 0;
    }
    return false;
  }
  return search() ? board : null;
}

export function generatePuzzle(difficulty = 'easy', rng = Math.random) {
  const target = (DIFFICULTIES[difficulty] || DIFFICULTIES.easy).clues;
  const solution = generateSolved(rng);
  const puzzle = clone(solution);
  const cells = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) cells.push({ row, col });
  }
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  let clues = SIZE * SIZE;
  for (const cell of cells) {
    if (clues <= target) break;
    const value = puzzle[cell.row][cell.col];
    puzzle[cell.row][cell.col] = 0;
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[cell.row][cell.col] = value;
    } else {
      clues -= 1;
    }
  }
  return { puzzle, solution, difficulty, clues };
}
