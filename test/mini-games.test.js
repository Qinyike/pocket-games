import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyBoard, move, canMove, spawnTile, hasValue } from '../src/games/mini/g2048/logic.js';
import { SnakeEngine } from '../src/games/mini/snake/logic.js';
import { MinesweeperGame, DIFFICULTIES } from '../src/games/mini/minesweeper/logic.js';
import { BreakoutEngine, WORLD } from '../src/games/mini/breakout/logic.js';
import { createBoard, checkWinner, chooseMove } from '../src/games/mini/gomoku/logic.js';
import { createBoard as createReversi, legalMoves, place, countDiscs } from '../src/games/mini/reversi/logic.js';
import { generateSolved, generatePuzzle, countSolutions, solve, isValid } from '../src/games/mini/sudoku/logic.js';

function seeded(seed = 1) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

test('2048 合并、加分与无路可走', () => {
  let board = createEmptyBoard();
  board[0] = [2, 2, 2, 2];
  let result = move(board, 'left');
  assert.deepEqual(result.board[0], [4, 4, 0, 0]);
  assert.equal(result.gained, 8);
  assert.equal(result.moved, true);

  board = createEmptyBoard();
  board[0] = [4, 4, 8, 0];
  result = move(board, 'right');
  assert.deepEqual(result.board[0], [0, 0, 8, 8]);

  board = createEmptyBoard();
  board[0] = [0, 2, 0, 0];
  board[1] = [2, 4, 8, 16];
  assert.equal(move(board, 'left').moved, true);
  assert.equal(canMove(createEmptyBoard()), true);

  const full = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  assert.equal(canMove(full), false);
  assert.equal(move(full, 'left').moved, false);
});

test('2048 生成新格与胜利判断', () => {
  const board = createEmptyBoard();
  const spot = spawnTile(board, () => 0.5);
  assert.ok(spot);
  assert.ok([2, 4].includes(board[spot.y][spot.x]));
  board[0][0] = 2048;
  assert.equal(hasValue(board, 2048), true);
});

test('贪吃蛇移动、吃食物和撞墙', () => {
  const engine = new SnakeEngine({ size: 10, rng: () => 0 });
  const head = engine.snake[0];
  engine.food = { x: head.x + 1, y: head.y };
  const before = engine.snake.length;
  const result = engine.step();
  assert.equal(result.ate, true);
  assert.equal(engine.score, 10);
  assert.equal(engine.snake.length, before + 1);

  const engine2 = new SnakeEngine({ size: 6 });
  engine2.setDirection('left');
  assert.equal(engine2.nextDirection, 'right');
  engine2.setDirection('up');
  assert.equal(engine2.nextDirection, 'up');
  for (let i = 0; i < 20; i += 1) engine2.step();
  assert.equal(engine2.alive, false);
});

test('扫雷首击安全、插旗和通关', () => {
  const engine = new MinesweeperGame('easy', seeded(4));
  engine.reveal(0, 0);
  assert.equal(engine.status, 'playing');
  assert.equal(engine.board[0][0].mine, false);
  for (const n of engine.neighbors(0, 0)) {
    assert.equal(engine.board[n.y][n.x].mine, false);
  }
  const target = engine.board[0][3];
  target.revealed = false;
  assert.equal(engine.toggleFlag(3, 0), true);
  assert.equal(engine.flags, 1);
  assert.equal(engine.toggleFlag(3, 0), true);
  assert.equal(engine.flags, 0);

  // 把所有安全格翻开，应该获胜。
  for (let y = 0; y < engine.config.rows; y += 1) {
    for (let x = 0; x < engine.config.cols; x += 1) {
      if (!engine.board[y][x].mine) engine.reveal(x, y);
    }
  }
  assert.equal(engine.status, 'won');
  assert.ok(Object.keys(DIFFICULTIES).includes(engine.difficulty));
});

test('打砖块击碎砖块与掉球', () => {
  const engine = new BreakoutEngine();
  const brick = engine.bricks[0];
  engine.launched = true;
  engine.ball.x = brick.x + brick.width / 2;
  engine.ball.y = brick.y + brick.height / 2;
  engine.ball.vx = 0;
  engine.ball.vy = 100;
  const score = engine.score;
  engine.step(0.01);
  assert.equal(brick.alive, false);
  assert.ok(engine.score > score);

  const engine2 = new BreakoutEngine();
  engine2.launched = true;
  engine2.ball.y = WORLD.height + 10;
  engine2.ball.vy = 100;
  engine2.step(0.01);
  assert.equal(engine2.lives, 2);
  assert.equal(engine2.launched, false);
});

test('五子棋胜负与 AI 堵四', () => {
  const board = createBoard();
  for (let x = 3; x < 7; x += 1) board[7][x] = 1;
  board[7][7] = 1;
  assert.equal(checkWinner(board, 7, 7, 1), 1);

  const blockBoard = createBoard();
  for (let x = 5; x < 9; x += 1) blockBoard[7][x] = 1;
  const move = chooseMove(blockBoard, 2, 1, 'normal', seeded(2));
  assert.ok(
    (move.x === 4 && move.y === 7) || (move.x === 9 && move.y === 7),
    `AI 应堵住四连，实际 ${move.x},${move.y}`,
  );
});

test('黑白棋初始合法步、翻转和计数', () => {
  const board = createReversi();
  const moves = legalMoves(board, 1);
  assert.equal(moves.length, 4);
  const flips = place(board, 2, 3, 1);
  assert.equal(flips.length, 1);
  assert.equal(board[3][3], 1);
  const counts = countDiscs(board);
  assert.equal(counts.black, 4);
  assert.equal(counts.white, 1);
});

test('数独生成唯一解、求解与校验', { timeout: 30_000 }, () => {
  const rng = seeded(7);
  const solved = generateSolved(rng);
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      assert.ok(solved[row][col] >= 1 && solved[row][col] <= 9);
      assert.equal(isValid(solved, row, col, solved[row][col]), true);
    }
  }
  const { puzzle, solution } = generatePuzzle('easy', rng);
  assert.equal(countSolutions(puzzle, 2), 1);
  const answer = solve(puzzle);
  assert.deepEqual(answer, solution);
  assert.ok(puzzle.flat().filter((v) => v === 0).length > 20);
});
