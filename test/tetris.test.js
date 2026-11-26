import test from 'node:test';
import assert from 'node:assert/strict';

import { TetrisEngine, SHAPES } from '../src/games/tetris/engine.js';

function engineWith(seed = 1) {
  let value = seed;
  const rng = () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
  return new TetrisEngine({ rng });
}

test('7-bag：每七个方块恰好包含七种类型', () => {
  const engine = engineWith(7);
  const types = [];
  for (let i = 0; i < 7; i += 1) {
    types.push(engine.active.type);
    engine.hardDrop();
  }
  assert.equal(new Set(types).size, 7);
  assert.deepEqual([...types].sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
});

test('左右移动与墙踢不会越界', () => {
  const engine = engineWith(2);
  engine.spawnType('T');
  engine.active.x = 7;
  assert.equal(engine.move(1, 0), false);
  assert.equal(engine.rotate(1), true);
  for (const cell of engine.activeCells) {
    assert.ok(cell.x >= 0 && cell.x < engine.cols, '旋转后仍在场地内');
  }
});

test('一行消除会加分并累计消行数', () => {
  const engine = engineWith(3);
  for (let x = 0; x < engine.cols; x += 1) {
    if (x !== 4 && x !== 5) engine.board[19][x] = 'J';
  }
  engine.spawnType('O');
  engine.active.x = 4;
  engine.active.y = 18;
  const result = engine.lock();
  assert.equal(result.cleared, 1);
  assert.equal(engine.lines, 1);
  assert.equal(engine.score, 100);
  assert.equal(result.gameOver, false);
});

test('一次消除四行得到 Tetris 分数', () => {
  const engine = engineWith(4);
  for (let y = 16; y < 20; y += 1) {
    for (let x = 1; x < engine.cols; x += 1) {
      engine.board[y][x] = 'J';
    }
  }
  engine.spawnType('I');
  engine.active.rotation = 1;
  engine.active.matrix = SHAPES.I[1];
  engine.active.x = -2; // 竖条实际落在第 0 列
  engine.active.y = 16;
  const result = engine.lock();
  assert.equal(result.cleared, 4);
  assert.equal(engine.lines, 4);
  assert.equal(engine.score, 800);
});

test('暂存每个方块只能用一次，落地后恢复', () => {
  const engine = engineWith(5);
  const first = engine.active.type;
  assert.equal(engine.hold(), true);
  assert.equal(engine.holdType, first);
  assert.equal(engine.canHold, false);
  assert.equal(engine.hold(), false);
  engine.hardDrop();
  assert.equal(engine.canHold, true);
  const secondActive = engine.active.type;
  const second = engine.hold();
  assert.equal(second, true);
  assert.equal(engine.holdType, secondActive);
  assert.equal(engine.active.type, first);
});

test('合成区堆到出生点会触发游戏结束', () => {
  const engine = engineWith(6);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < engine.cols; x += 1) {
      engine.board[y][x] = 'J';
    }
  }
  engine.spawnType('T');
  assert.equal(engine.gameOver, true);
});

test('幽灵方块落在最底部且硬降立即锁定', () => {
  const engine = engineWith(8);
  engine.spawnType('O');
  const ghostY = engine.ghostY();
  assert.ok(ghostY > engine.active.y);
  const result = engine.hardDrop();
  assert.equal(result.locked, true);
  assert.ok(result.dropped > 0);
  assert.notEqual(engine.active, null);
  assert.equal(engine.board[19][4], 'O');
  assert.equal(engine.board[19][5], 'O');
});

test('等级随消行提升，速度加快', () => {
  const engine = engineWith(9);
  const startGravity = engine.gravityMs;
  engine.lines = 10;
  engine.level = 2;
  assert.ok(engine.gravityMs < startGravity);
});
