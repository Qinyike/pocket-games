import test from 'node:test';
import assert from 'node:assert/strict';

import { PLATFORM_LEVELS } from '../src/games/platform/levels.js';
import { PlatformEngine, PLAYER_HEIGHT } from '../src/games/platform/engine.js';

function tile(engine, col, row) {
  if (row < 0 || row >= engine.level.height) return ' ';
  if (col < 0 || col >= engine.level.width) return '#';
  return engine.level.grid[row][col];
}

function botInput(engine) {
  const p = engine.player;
  const footRow = Math.floor(p.y + p.height + 0.2);
  const bodyRow = footRow - 1;
  let wall = false;
  let spike = false;
  let noFloor = false;
  for (const lead of [0.55, 1.2, 2.0]) {
    const ahead = Math.floor(p.x + p.width + lead);
    wall ||= tile(engine, ahead, bodyRow) === '#' || tile(engine, ahead, bodyRow - 1) === '#';
    spike ||= tile(engine, ahead, bodyRow) === '^';
    if (lead < 0.8 && !'#='.includes(tile(engine, ahead, footRow))) {
      let supported = false;
      for (let row = footRow; row < engine.level.height; row += 1) {
        if ('#='.includes(tile(engine, ahead, row))) {
          supported = true;
          break;
        }
      }
      noFloor ||= !supported;
    }
  }
  const jump = engine.grounded ? wall || spike || noFloor : engine.vy < 0;
  return { right: true, jump };
}

test('平台关卡结构合法', () => {
  assert.equal(PLATFORM_LEVELS.length, 3);
  for (const level of PLATFORM_LEVELS) {
    const engine = new PlatformEngine(level);
    assert.equal(engine.level.totalCoins > 0, true);
    assert.equal(engine.enemyState.length > 0, true);
    assert.equal(engine.player.y + PLAYER_HEIGHT <= engine.level.height, true);
    assert.ok(engine.level.goal.col > engine.level.start.col);
  }
});

test('简单机器人能跑通全部三个关卡', { timeout: 30_000 }, () => {
  for (const level of PLATFORM_LEVELS) {
    const engine = new PlatformEngine(level);
    let steps = 0;
    while (!engine.won && !engine.gameOver && steps < 120 * 90) {
      engine.invincible = 999; // 只验证地形与跳跃路线，不把战斗纳入机器人测试。
      engine.step(1 / 120, botInput(engine));
      engine.drainEvents();
      steps += 1;
    }
    assert.equal(engine.won, true, `第 ${level.id} 关机器人未通关（x=${engine.player.x.toFixed(1)} y=${engine.player.y.toFixed(1)} hearts=${engine.hearts}）`);
  }
});
