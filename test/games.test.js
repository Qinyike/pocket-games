import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAREHOUSES, warehouse, pushMove, solved } from '../src/games/crates.js';
import { COLS, ROWS, clearRows, emptyRow } from '../src/games/blocks.js';
import { SIZE, machineMove, winLine } from '../src/games/gomoku.js';

const solutions = [
  'DLU',
  'ULULDLDR',
  'UDLLUURRDDLU',
  'UUDRRR',
  'UURULLLDDRRLLDLLURRRDRUURD',
  'LUUULURRLDDRRRDRUUDLDLLDLUUU',
  'RRRUULLDLUUDLLUURRRLLLDDDRDRRLUUU',
  'LLUURDRUURULRRRRDDDLUURULLRDDLDDLLUURRDRUU',
];
const moves = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] };

for (const [index, rows] of WAREHOUSES.entries()) {
  test(`warehouse ${index + 1} has a legal solution`, () => {
    let board = warehouse(rows);
    assert.equal(board.boxes.size, board.target.size);
    for (const key of solutions[index]) {
      const next = pushMove(board, ...moves[key]);
      assert.notEqual(next, board);
      board = next;
    }
    assert.ok(solved(board));
  });
}

test('push and blocked move preserve the previous snapshot for undo', () => {
  const initial = warehouse(WAREHOUSES[0]);
  const down = pushMove(initial, 0, 1);
  const left = pushMove(down, -1, 0);
  assert.equal(pushMove(left, 0, 1), left);
  const final = pushMove(left, 0, -1);
  assert.equal(left.boxes.has(initial.player - 1), true);
  assert.equal(final.pushes, 1);
  assert.equal(solved(final), true);
  assert.equal(solved(initial), false);
});

test('non-adjacent full rows collapse while preserving remaining order', () => {
  const initial = Array.from({ length:ROWS }, emptyRow);
  initial[ROWS - 1] = Array(COLS).fill(0);
  initial[ROWS - 3] = Array(COLS).fill(1);
  initial[ROWS - 2][4] = 2;
  const result = clearRows(initial);
  assert.equal(result.count, 2);
  assert.equal(result.board.length, ROWS);
  assert.equal(result.board[ROWS - 1][4], 2);
  assert.equal(initial[ROWS - 2][4], 2);
});

test('detects a diagonal win near the edge and does not wrap rows', () => {
  const board = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < 5; i += 1) board[i * SIZE + SIZE - 1 - i] = 1;
  assert.equal(winLine(board, SIZE - 1, 1).length, 5);
  board.fill(0);
  for (let i = SIZE - 2; i < SIZE + 3; i += 1) board[i] = 2;
  assert.deepEqual(winLine(board, SIZE, 2), []);
});

test('gomoku AI prioritizes a winning move and blocks immediate loss', () => {
  const board = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < 4; i += 1) board[5 * SIZE + i] = 1;
  assert.equal(machineMove(board), 5 * SIZE + 4);
  for (let i = 0; i < 4; i += 1) board[8 * SIZE + i] = 2;
  assert.equal(machineMove(board), 8 * SIZE + 4);
});
