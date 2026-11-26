import assert from 'node:assert/strict';
import test from 'node:test';
import { mountTrail, TRAILS } from '../src/games/trail.js';

function playTrail(t, level) {
  let frame, changeLevel, press, overlay;
  let x = 22, now = 0, feet = 0, shield, deaths;
  const sounds = [];
  const held = new Set();
  const noop = () => {};
  const previousGlobals = {
    requestAnimationFrame: globalThis.requestAnimationFrame,
    document: globalThis.document,
  };
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  globalThis.document = { addEventListener: noop };
  t.after(() => {
    for (const [key, value] of Object.entries(previousGlobals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });

  let transforms = 0;
  const canvas = new Proxy({}, {
    get: (_, key) => key === 'translate' ? (drawX, drawY) => {
      transforms += 1;
      if (transforms === 2) { x = drawX - 6; feet = drawY; }
    } : noop,
    set: () => true,
  });
  mountTrail({
    signal: new AbortController().signal,
    canvas: () => ({ getContext: () => canvas }),
    select: (_, __, callback) => { changeLevel = callback; return noop; },
    controls: (_, __, callback) => { press = callback; return { held: action => held.has(action), clear: () => held.clear() }; },
    hud: (_, __, [, power], [, count]) => { shield = power; deaths = count; },
    play: effect => sounds.push(effect),
    message: noop,
    hideOverlay: noop,
    restart: noop,
    overlay: title => { overlay = title; },
  });
  changeLevel(level);
  return {
    held, sounds, press,
    get x() { return x; },
    get feet() { return feet; },
    get shield() { return shield; },
    get deaths() { return deaths; },
    get overlay() { return overlay; },
    step() {
      transforms = 0;
      now += 1000 / 120;
      frame(now);
    },
  };
}

// Recorded jump inputs reach each original exit with the normal walking speed.
const routes = [
  [144,212,344,468,538,725,738,787,891],
  [122,235.5,308,361.12,409,444,489,539,629.5,739,834,946],
  [123,206.5,276,363,444.5,503,574.5,696,824.5,897.5,928.27],
  [164,291.7,348,450,540,638.5,718.5,779,914,991,1086,1103.33],
];

for (const [level, jumps] of routes.entries()) {
  test(`trail exit can be reached in ${TRAILS[level].name}`, t => {
    const trial = playTrail(t, level);
    let nextJump = 0;
    let release = 0;
    trial.held.add('right');
    for (let step = 0; step < 1600 && !trial.overlay && !trial.deaths; step += 1) {
      trial.step();
      if (step >= release) trial.held.delete('jump');
      if (trial.x >= jumps[nextJump]) {
        trial.held.add('jump');
        trial.press('jump');
        release = step + 63;
        nextJump += 1;
      }
    }
    assert.equal(trial.deaths, 0);
    assert.equal(trial.overlay, level === TRAILS.length - 1 ? '探险完成' : '抵达出口');
  });
}

test('striking a shield pod from below grants its shield once', t => {
  const trial = playTrail(t, 3);
  trial.held.add('right');
  for (let step = 0; step < 130 && trial.x < 82; step += 1) trial.step();
  trial.held.delete('right');
  for (let step = 0; step < 20; step += 1) trial.step();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    trial.held.add('jump');
    trial.press('jump');
    for (let step = 0; step < 84; step += 1) trial.step();
    trial.held.delete('jump');
    assert.equal(trial.feet, 162);
  }
  assert.equal(trial.shield, '有');
  assert.equal(trial.sounds.filter(effect => effect === 'shield').length, 1);
});
