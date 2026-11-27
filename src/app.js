import { cover } from './art.js';
import { createAudio } from './audio.js';
import { input, load, save } from './engine.js';
import { setupPwa } from './pwa.js';
import { mountTrail } from './games/trail.js';
import { mountCrates } from './games/crates.js';
import { mountTanks } from './games/tanks.js';
import { mountBlocks } from './games/blocks.js';
import { mountGomoku } from './games/gomoku.js';
import { mountMines } from './games/mines.js';
import { mountCircuit } from './games/circuit.js';
import { mountDuel } from './games/duel.js';
import { xiangqi } from './games/xiangqi.js';
import { junqi } from './games/junqi.js';
import { mountExpedition } from './games/expedition.js';
import { mountBastion } from './games/bastion.js';
import { mountHarbor } from './games/harbor.js';

const games = [
  { id:'expedition', title:'烬核远征', type:'回合制地牢', color:'#e6a782', campaign:true, goal:'从三种职业中选择。逐层探索，搜集印记，击败两座守门钟并回收烬核。下楼前可用碎银补充药剂。', keys:'点击地块或用方向键移动。点相邻敌人攻击，Q 绝技，E 药剂，空格等待。可点已探索地块沿路线走一步。', mount:mountExpedition },
  { id:'bastion', title:'群岛防线', type:'策略塔防', color:'#95d8ba', campaign:true, goal:'四张地图各 16 波，合理安排四种塔。每种塔的三级有两种专精，搭配范围伤害、减速和连锁攻击。', keys:'点地块选位，选塔后点建造。战场聚焦时可用方向键选位、回车建塔。', mount:mountBastion },
  { id:'harbor', title:'潮汐港湾', type:'港口经营', color:'#8cd5df', campaign:true, goal:'从港口铺栈道，连通生产建筑，手动推进每天的生产。完成订单、解锁研究，最终点亮灯城。', keys:'点地图选地，点建筑类型再建造。展开「集市与收支」可买卖物资。', mount:mountHarbor },
  { id:'trail', title:'风谷探险', type:'横版跳跃', color:'#c8fa76', action:true, goal:'穿越十二个区域，踩落巡逻机，从下方顶开补给盒收集碎片或获得护盾。沿途可激活信标，从该处继续。', keys:'← → / A D 移动 · Shift / X 加速 · 空格 / ↑ 跳跃，长按跳得更高', mount:mountTrail },
  { id:'crates', title:'仓库调度', type:'推箱解谜', color:'#ffc484', goal:'把每口货箱推上一个标记格。走错可撤销，长按方向键可连续移动。', keys:'方向键 / WASD 移动 · Z 撤销', mount:mountCrates },
  { id:'tanks', title:'钢甲防线', type:'装甲闯关', color:'#a5e7bd', action:true, goal:'驾驶装甲车保护充能核心，击退全部巡逻机。砖墙可打碎，钢墙会挡住火力。', keys:'方向键 / WASD 移动 · 空格开火', mount:mountTanks },
  { id:'blocks', title:'像素落块', type:'落块消行', color:'#bcb1ff', goal:'拼满一行就会消除。每清除五行加速，槽位可以保留一块备用。', keys:'← → 移动 · ↑ 旋转 · ↓ 软降 · 空格硬降 · C 暂存', mount:mountBlocks },
  { id:'gomoku', title:'方寸五子', type:'五子棋', color:'#f3bb97', goal:'黑方先行，横、纵或斜向连成五颗即胜。支持三档人机难度或同屏双人。', keys:'点击或轻触落子 · 棋盘聚焦后方向键选格，回车落子', mount:mountGomoku },
  { id:'mines', title:'扫雷', type:'数字推理', color:'#73dfd5', goal:'翻开所有安全格。首次翻格的九宫格安全，数字代表周边雷数。标记正确后可再点已翻开的数字快速展开。', keys:'点击或回车翻格 · 右键或 F 插旗 · 触屏可切换插旗模式', mount:mountMines },
  { id:'circuit', title:'电路接通', type:'连线解谜', color:'#f5ce70', goal:'旋转线路，从中央电源把电送到所有节点。每次重开生成新棋盘。', keys:'方向键选格 · 回车或点击转动', mount:mountCircuit },
  { id:'xiangqi', title:'中国象棋', type:'人机 · 双人', color:'#f4b18f', goal:'红先黑后。须解将，不能送将或让双方将帅在空线上照面。将死或困毙获胜。自动处理单方长将与自然限着，其他长捉棋例由双方协商。', keys:'点击棋子，再点击落点。方向键选格，回车确认。', mount:api=>mountDuel(api,xiangqi) },
  { id:'junqi', title:'军棋', type:'暗棋 · 人机', color:'#b8df91', goal:'默认与电脑打暗棋，也可本机双人。沿公路走一步，铁路走直线，工兵可转弯。司令阵亡后军旗亮明。夺旗或使对方无棋可走即胜。', keys:'开局可点「调整布阵」。点击己方棋子和目标格；双人模式换手后点「开始回合」。', mount:api=>mountDuel(api,junqi) },
];

const app = document.querySelector('#app');
const sound = document.querySelector('#sound');
const fullscreen = document.querySelector('#fullscreen');
let session;
let muted = !load('sound', true);
const audio = createAudio(!muted);
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
function setSound() {
  setIcon(sound, muted ? 'off' : 'on', muted ? '开启音乐和音效' : '关闭音乐和音效');
  sound.setAttribute('aria-pressed', String(!muted));
}
setSound();
sound.onclick = () => { muted = !muted; save('sound', !muted); setSound(); audio.enable(!muted); };
const standalone = matchMedia('(display-mode: standalone)');
const coarsePointer = matchMedia('(pointer: coarse)');

function updateLobbyFullscreen() {
  const expanded = Boolean(document.fullscreenElement);
  fullscreen.hidden = Boolean(app.querySelector('.game'))
    || standalone.matches || navigator.standalone || coarsePointer.matches || !document.fullscreenEnabled;
  setIcon(fullscreen, 'fullscreen', expanded ? '退出全屏' : '全屏');
  fullscreen.setAttribute('aria-pressed', String(expanded));
}

fullscreen.onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    updateLobbyFullscreen();
  }
};
document.addEventListener('fullscreenchange', updateLobbyFullscreen);
standalone.addEventListener?.('change', updateLobbyFullscreen);
coarsePointer.addEventListener?.('change', updateLobbyFullscreen);
window.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') audio.unlock(); }, { passive:true });
window.addEventListener('pointerup', audio.unlock, { passive:true });
window.addEventListener('keydown', audio.unlock);
document.addEventListener('visibilitychange', audio.sync);

function home() {
  app.innerHTML = `
    <section class="hero">
      <canvas width="400" height="128" aria-hidden="true"></canvas>
      <div class="hero-copy"><h1>口袋游戏厅</h1>
      <p>${games.length} 款小游戏，打开就玩。</p>
      <a class="primary" href="#/trail">玩风谷探险 <span class="arrow-icon" aria-hidden="true"></span></a></div>
    </section>
    <section><div class="section-head"><h2>选个游戏</h2></div>
    <div class="catalog">${games.map(game => `<a class="card" href="#/${game.id}" style="--accent:${game.color}"><canvas width="124" height="80" aria-hidden="true"></canvas><div class="card-body"><div><strong>${game.title}</strong><small>${game.type}</small></div><span class="card-arrow arrow-icon" aria-hidden="true"></span></div></a>`).join('')}</div></section>`;
  cover(app.querySelector('.hero canvas'), 'hero');
  app.querySelectorAll('.card canvas').forEach((canvas, index) => cover(canvas, games[index].id));
}

function setupGameOrientation(game, view, signal) {
  const landscape = matchMedia('(orientation: landscape)');
  const touch = matchMedia('(any-pointer: coarse)');
  const phone = matchMedia('(max-width: 600px), (max-height: 600px)');
  const hint = view.querySelector('.orientation-hint');
  const toggle = view.querySelector('.landscape-toggle');
  let manual = false;
  let timer;

  function announce(message) {
    clearTimeout(timer);
    hint.textContent = message;
    timer = setTimeout(() => { hint.textContent = ''; }, 2500);
  }

  function updateLayout() {
    if (landscape.matches || !touch.matches) manual = false;
    view.toggleAttribute('data-rotated', manual);
    view.toggleAttribute('data-landscape', game.action && touch.matches && (landscape.matches || manual));
    if (toggle) {
      toggle.hidden = !touch.matches || landscape.matches;
      toggle.textContent = manual ? '退出横屏' : '横屏';
      toggle.setAttribute('aria-pressed', String(manual));
    }
  }

  function orientationChanged() {
    updateLayout();
    if (touch.matches) announce(landscape.matches ? '已切换到横屏布局' : '已切换到竖屏布局');
  }

  if (toggle) toggle.onclick = () => {
    if (landscape.matches || !touch.matches) return;
    manual = !manual;
    updateLayout();
    window.scrollTo(0, 0);
    const stage = view.querySelector('.stage');
    (stage.querySelector('.overlay button') ?? stage).focus({ preventScroll:true });
    announce(manual ? '已切换到横屏布局' : '已切换到竖屏布局');
  };

  updateLayout();
  if (touch.matches && phone.matches) {
    if (toggle && !landscape.matches) announce('转动手机，或点「横屏」');
    else if (game.action && !landscape.matches) announce('横屏可分开左右操作键');
    if (game.id === 'blocks' && landscape.matches) announce('竖屏可放大落块棋盘');
  }
  landscape.addEventListener('change', orientationChanged, { signal });
  touch.addEventListener('change', updateLayout, { signal });
  signal.addEventListener('abort', () => clearTimeout(timer), { once:true });
}

function gameView(game, signal) {
  app.innerHTML = `
    <section class="game" data-game="${game.id}" ${game.campaign ? 'data-campaign' : ''} style="--accent:${game.color}">
      <header class="game-header">
        <div class="game-heading"><a class="back" href="#/" aria-label="返回大厅"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></a><h1>${game.title}</h1></div>
        <div class="row"><div class="mode-choice"></div>${game.id === 'trail' ? '<button class="quiet landscape-toggle" type="button" hidden>横屏</button>' : ''}<button class="quiet display-mode" type="button">全屏</button><button class="quiet restart" type="button">重开</button></div>
      </header>
      <div class="orientation-hint" role="status" aria-atomic="true"></div>
      <div class="game-grid">
        <div class="play-area">
          ${game.action ? '<div class="controls-settings"><label>键位 <select class="quiet" aria-label="触控键位"><option value="standard">标准</option><option value="large">大键</option><option value="mirror">镜像</option><option value="large-mirror">大键镜像</option></select></label></div>' : ''}
          <div class="hud" aria-label="本局状态"></div>
          <div tabindex="-1" class="stage ${game.action ? 'action-stage' : game.campaign ? 'campaign-stage' : 'board-stage'}"></div>
          <div class="touch"><div class="dpad"></div><div class="action-buttons"></div></div>
          <p class="game-message" role="status"></p>
        </div>
        <aside class="guide"><h2>怎么玩</h2><p>${game.goal}</p><p>${game.keys}</p>${game.action ? '<p>横握手机可获得更大的操作区。</p>' : ''}</aside>
      </div>
    </section>`;
  const stage = app.querySelector('.stage');
  const layout = app.querySelector('.controls-settings select');
  if (layout) {
    const area = stage.parentElement;
    const key = game.id + ':controls';
    const cached = load(key, 'standard');
    if ([...layout.options].some(option => option.value === cached)) layout.value = cached;
    area.dataset.controls = layout.value;
    layout.onchange = () => {
      area.dataset.controls = layout.value;
      save(key, layout.value);
      stage.focus({ preventScroll:true });
    };
  }
  const touch = app.querySelector('.touch');
  const choice = app.querySelector('.mode-choice');
  let controls;
  const display = app.querySelector('.display-mode');
  function updateGameFullscreen() {
    const expanded = document.body.dataset.mode === 'focus' || Boolean(document.fullscreenElement);
    display.setAttribute('aria-pressed', String(expanded));
    display.textContent = expanded ? '退出全屏' : '全屏';
  }
  display.onclick = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else if (document.body.dataset.mode === 'focus') {
      delete document.body.dataset.mode;
    } else {
      document.body.dataset.mode = 'focus';
    }
    updateGameFullscreen();
    window.scrollTo(0, 0);
    const target = stage.querySelector('.overlay button') ?? stage.querySelector('[tabindex="0"]') ?? stage;
    target.focus({ preventScroll:true });
  };
  document.addEventListener('fullscreenchange', updateGameFullscreen, { signal });
  updateGameFullscreen();
  function hideOverlay() {
    const overlay = stage.querySelector('.overlay');
    if (overlay?.contains(document.activeElement)) stage.focus({ preventScroll:true });
    overlay?.remove();
  }
  const api = {
    signal, stage, play: audio.play,
    hideOverlay() {
      hideOverlay();
      audio.pause(false);
    },
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
      stage.style.setProperty('--arena-ratio', width / height);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', label);
      stage.prepend(canvas);
      return canvas;
    },
    controls(mapping, commands, action, active) {
      controls = input(signal, mapping, action, active);
      for (const [id, label, emphasis, name, type] of commands) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'action' + (emphasis ? ' emphasis' : '');
        button.textContent = label;
        button.setAttribute('aria-label', name ?? label);
        button.dataset.action = id;
        const directional = (game.action || game.id === 'blocks' || game.id === 'expedition') && ['left','right','up','down'].includes(id);
        touch.querySelector(directional ? '.dpad' : '.action-buttons').append(button);
        if (type === 'toggle' || type === 'tap') button.onclick = () => { if (active()) action(id, true); };
        else controls.bind(button, id);
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
      audio.pause(true);
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
  setupGameOrientation(game, app.querySelector('.game'), signal);
}

function route() {
  session?.abort();
  session = new AbortController();
  delete document.body.dataset.mode;
  const game = games.find(item => location.hash === '#/' + item.id);
  audio.select(game?.id);
  document.title = game ? `${game.title} · 口袋游戏厅` : '口袋游戏厅 · Pocket Arcade';
  if (game) gameView(game, session.signal);
  else home();
  updateLobbyFullscreen();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
setupPwa();
