import test from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS } from '../src/games/sokoban/levels.js';
import {
  parseLevel,
  createGame,
  move,
  undo,
  reset,
  canUndo,
  hasSimpleDeadlock,
} from '../src/games/sokoban/logic.js';
import { parseLevel as parseForSolver, solve } from '../scripts/lib/sokoban-solver.mjs';

test('24 个关卡结构合法，且 par 等于最少推动次数', { timeout: 180_000 }, () => {
  assert.equal(LEVELS.length, 24);
  const ids = new Set();
  for (const level of LEVELS) {
    assert.ok(!ids.has(level.id), `关卡 id 重复：${level.id}`);
    ids.add(level.id);
    assert.ok(level.name.length > 0);
    assert.ok(level.par > 0);
    const parsed = parseLevel(level);
    assert.equal(parsed.cols, level.map.split('\n')[0].length);
    assert.equal(parsed.rows, level.map.split('\n').length);
    assert.equal(parsed.startBoxes.length, parsed.goals.size);

    const solved = solve(parseForSolver(level.map), { maxStates: 600_000, timeLimitMs: 20_000 });
    assert.equal(solved.truncated, false, `第 ${level.id} 关求解超时`);
    assert.equal(solved.solvable, true, `第 ${level.id} 关无解`);
    assert.equal(solved.pushes, level.par, `第 ${level.id} 关 par 不一致`);
  }
});

test('推动、胜利、撤销与重置', () => {
  const level = parseLevel({
    map: '#####\n#@$.#\n#####',
    id: 1,
    name: '测试',
    difficulty: '新手',
    hint: '',
    par: 1,
  });
  const state = createGame(level);
  assert.equal(canUndo(state), false);

  const result = move(state, 'right');
  assert.equal(result.moved, true);
  assert.equal(result.pushed, true);
  assert.equal(result.won, true);
  assert.equal(state.moves, 1);
  assert.equal(state.pushes, 1);
  assert.equal(state.won, true);
  assert.equal(canUndo(state), true);

  assert.equal(undo(state), true);
  assert.equal(state.moves, 0);
  assert.equal(state.pushes, 0);
  assert.equal(state.won, false);
  assert.deepEqual([...state.boxes], ['2,1']);
  assert.deepEqual(state.player, { x: 1, y: 1 });

  move(state, 'right');
  reset(state);
  assert.equal(state.moves, 0);
  assert.equal(state.pushes, 0);
  assert.equal(canUndo(state), false);
  assert.deepEqual([...state.boxes], ['2,1']);
});

test('墙壁与箱子阻挡不会增加步数', () => {
  const level = parseLevel({
    map: '#####\n#@ .#\n#$  #\n#####',
    id: 1,
    name: '测试',
    difficulty: '新手',
    hint: '',
    par: 1,
  });
  const state = createGame(level);
  const blocked = move(state, 'up');
  assert.equal(blocked.moved, false);
  assert.equal(state.moves, 0);

  const level2 = parseLevel({
    map: '#######\n#@$$..#\n#######',
    id: 1,
    name: '测试',
    difficulty: '新手',
    hint: '',
    par: 1,
  });
  const state2 = createGame(level2);
  const blocked2 = move(state2, 'right');
  assert.equal(blocked2.moved, false);
  assert.equal(state2.moves, 0);
});

test('能识别简单角落死锁', () => {
  const level = parseLevel({
    map: '#####\n#@ .#\n#$  #\n#####',
    id: 1,
    name: '测试',
    difficulty: '新手',
    hint: '',
    par: 1,
  });
  const state = createGame(level);
  assert.equal(hasSimpleDeadlock(state), true);
  move(state, 'down');
  assert.equal(hasSimpleDeadlock(state), true);
});

test('箱子与目标数量不一致时会报错', () => {
  assert.throws(
    () =>
      parseLevel({
        map: '#####\n#@$ #\n#####',
        id: 1,
        name: '坏关卡',
        difficulty: '新手',
        hint: '',
        par: 1,
      }),
    /数量不一致/,
  );
});
