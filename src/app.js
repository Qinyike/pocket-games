import { cover } from './art.js';
import { input, load, save } from './engine.js';
import { setupPwa } from './pwa.js';
import { mountTrail } from './games/trail.js';
import { mountCrates } from './games/crates.js';
import { mountTanks } from './games/tanks.js';
import { mountBlocks } from './games/blocks.js';
import { mountGomoku } from './games/gomoku.js';

const games = [
  { id:'trail', title:'风谷探险', type:'横版跳跃', color:'#c8fa76', action:true, goal:'穿越风谷、暮色矿坑和霜脊，收集能量碎片，抵达出口。', keys:'← → / A D 移动 · 空格 / ↑ 跳跃', mount:mountTrail },
  { id:'crates', title:'仓库调度', type:'推箱解谜', color:'#ffc484', goal:'把每口货箱推上一个标记格。走错可撤销，长按方向键可连续移动。', keys:'方向键 / WASD 移动 · Z 撤销', mount:mountCrates },
  { id:'tanks', title:'钢甲防线', type:'装甲闯关', color:'#a5e7bd', action:true, goal:'驾驶装甲车保护充能核心，击退全部巡逻机。砖墙可打碎，钢墙会挡住火力。', keys:'方向键 / WASD 移动 · 空格开火', mount:mountTanks },
  { id:'blocks', title:'像素落块', type:'落块消行', color:'#bcb1ff', goal:'拼满一行就会消除。每清除五行加速，槽位可以保留一块备用。', keys:'← → 移动 · ↑ 旋转 · ↓ 软降 · 空格硬降 · C 暂存', mount:mountBlocks },
  { id:'gomoku', title:'方寸五子', type:'五子棋', color:'#f3bb97', goal:'黑方先行，横、纵或斜向连成五颗即胜。支持人机或同屏双人。', keys:'点击或轻触落子 · 棋盘聚焦后方向键选格，回车落子', mount:mountGomoku },
];

const app = document.querySelector('#app');
const sound = document.querySelector('#sound');
const fullscreen = document.querySelector('#fullscreen');
let session;
let audio;
let muted = !load('sound', false);
const icons = {
  on:'<path d="M3 9v6h4l5 4V5L7 9H3m13-1a5 5 0 0 1 0 8m2-11a9 9 0 0 1 0 14"/>',
  off:'<path d="M3 9v6h4l5 4V5L7 9H3m13 1 5 5m0-5-5 5"/>',
  fullscreen:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
};
function setIcon(element, name, label) {
  element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  element.setAttribute('aria-label', label);
  element.title = label;
}
function unlock() {
  if (muted || !window.AudioContext) return;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
}
function play(note = 460) {
  if (muted || audio?.state !== 'running') return;
  const start = audio.currentTime;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(note, start);
  gain.gain.setValueAtTime(.085, start);
  gain.gain.exponentialRampToValueAtTime(.001, start + .10);
  tone.connect(gain).connect(audio.destination);
  tone.start();
  tone.stop(start + .11);
}
function setSound() {
  setIcon(sound, muted ? 'off' : 'on', muted ? '开启音效' : '关闭音效');
  sound.setAttribute('aria-pressed', String(!muted));
}
setSound();
setIcon(fullscreen, 'fullscreen', '全屏');
sound.onclick = () => { muted = !muted; save('sound', !muted); setSound(); unlock(); play(); };
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else if (document.documentElement.requestFullscreen && document.fullscreenEnabled) {
    document.documentElement.requestFullscreen().catch(() => toggleFocus());
  } else toggleFocus();
}
function toggleFocus() {
  if (document.body.dataset.mode) delete document.body.dataset.mode;
  else document.body.dataset.mode = 'focus';
}
fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.onclick = toggleFullscreen;
window.addEventListener('pointerdown', unlock, { passive:true });
window.addEventListener('keydown', unlock);

function home() {
  app.innerHTML = `
    <section class="hero">
      <canvas width="400" height="128" aria-hidden="true"></canvas>
      <div class="hero-copy"><h1>口袋游戏厅</h1>
      <p>五款小游戏，打开就玩。</p>
      <a class="primary" href="#/trail">玩风谷探险 <span class="arrow-icon" aria-hidden="true"></span></a></div>
    </section>
    <section><div class="section-head"><h2>选个游戏</h2></div>
    <div class="catalog">${games.map(game => `<a class="card" href="#/${game.id}" style="--accent:${game.color}"><canvas width="124" height="80" aria-hidden="true"></canvas><div class="card-body"><div><strong>${game.title}</strong><small>${game.type}</small></div><span class="card-arrow arrow-icon" aria-hidden="true"></span></div></a>`).join('')}</div></section>`;
  cover(app.querySelector('.hero canvas'), 'hero');
  app.querySelectorAll('.card canvas').forEach((canvas, index) => cover(canvas, games[index].id));
}

function gameView(game, signal) {
  app.innerHTML = `
    <section class="game" style="--accent:${game.color}">
      <header class="game-header">
        <div class="game-heading"><a class="back" href="#/" aria-label="返回大厅">‹</a><h1>${game.title}</h1></div>
        <div class="row"><div class="mode-choice"></div><button class="quiet display-mode" type="button">专注</button><button class="quiet restart" type="button">重开</button></div>
      </header>
      <div class="game-grid">
        <div class="play-area">
          <div class="hud" aria-label="本局状态"></div>
          <div tabindex="-1" class="stage ${game.action ? 'action-stage' : 'board-stage'}"></div>
          <div class="touch"><div class="dpad"></div><div class="action-buttons"></div></div>
          <p class="game-message" role="status"></p>
        </div>
        <aside class="guide"><h2>怎么玩</h2><p>${game.goal}</p><p>${game.keys}</p>${game.action ? '<p>横握手机可获得更大的操作区。</p>' : ''}</aside>
      </div>
    </section>`;
  const stage = app.querySelector('.stage');
  const touch = app.querySelector('.touch');
  const choice = app.querySelector('.mode-choice');
  let controls;
  const display = app.querySelector('.display-mode');
  display.onclick = () => {
    toggleFocus();
    display.setAttribute('aria-pressed', String(Boolean(document.body.dataset.mode)));
    display.textContent = document.body.dataset.mode ? '退出专注' : '专注';
  };
  display.setAttribute('aria-pressed', 'false');
  function hideOverlay() {
    const overlay = stage.querySelector('.overlay');
    if (overlay?.contains(document.activeElement)) stage.focus({ preventScroll:true });
    overlay?.remove();
  }
  const api = {
    signal, stage, play, hideOverlay,
    select(label, items, selectValue) {
      const menu = document.createElement('select');
      menu.className = 'quiet';
      menu.setAttribute('aria-label', label);
      for (const [value, text] of items) menu.add(new Option(text, value));
      menu.onchange = () => selectValue(menu.value);
      choice.append(menu);
      return value => { menu.value = value; };
    },
    canvas(width, height, label) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', label);
      stage.prepend(canvas);
      return canvas;
    },
    controls(mapping, commands, action, active) {
      controls = input(signal, mapping, action, active);
      for (const [id, label, emphasis, name] of commands) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'action' + (emphasis ? ' emphasis' : '');
        button.textContent = label;
        button.setAttribute('aria-label', name ?? label);
        button.dataset.action = id;
        const directional = game.action && ['left','right','up','down'].includes(id);
        touch.querySelector(directional ? '.dpad' : '.action-buttons').append(button);
        controls.bind(button, id);
      }
      return controls;
    },
    hud(...labels) {
      app.querySelector('.hud').innerHTML = labels.map(([key, value]) => `<span>${key} <strong>${value}</strong></span>`).join('');
    },
    message(text) {
      const message = app.querySelector('.game-message');
      if (message.textContent !== text) message.textContent = text;
    },
    restart(handler) {
      app.querySelector('.restart').onclick = () => {
        handler();
        stage.focus({ preventScroll:true });
      };
    },
    overlay(title, subtitle, actions) {
      controls?.clear();
      hideOverlay();
      const overlay = document.createElement('section');
      overlay.className = 'overlay';
      overlay.setAttribute('aria-label', title);
      overlay.innerHTML = '<div class="overlay-box"><h2></h2><p></p><div class="overlay-actions"></div></div>';
      overlay.querySelector('h2').textContent = title;
      overlay.querySelector('p').textContent = subtitle;
      for (const [label, callback] of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = overlay.querySelector('button') ? 'quiet' : 'primary';
        button.textContent = label;
        button.onclick = callback;
        overlay.querySelector('.overlay-actions').append(button);
      }
      stage.append(overlay);
      overlay.querySelector('button')?.focus({ preventScroll:true });
    },
  };
  game.mount(api);
}

function route() {
  session?.abort();
  session = new AbortController();
  delete document.body.dataset.mode;
  const game = games.find(item => location.hash === '#/' + item.id);
  document.title = game ? `${game.title} · 口袋游戏厅` : '口袋游戏厅 · Pocket Arcade';
  if (game) gameView(game, session.signal);
  else home();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
setupPwa();
