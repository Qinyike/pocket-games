import { load, save } from '../engine.js';
import { puzzleGrid } from './puzzle-grid.js';

const difficulties = [[9,10,'入门'],[12,22,'进阶'],[16,42,'挑战']];

function neighbors(index, size) {
  const x = index % size, y = Math.floor(index / size);
  const nearby = [];
  for (let row = Math.max(0,y-1); row <= Math.min(size-1,y+1); row += 1) {
    for (let col = Math.max(0,x-1); col <= Math.min(size-1,x+1); col += 1) {
      if (col !== x || row !== y) nearby.push(row * size + col);
    }
  }
  return nearby;
}

export function minefield(size, count, first, random = Math.random) {
  const safe = new Set([first,...neighbors(first,size)]);
  const pool = Array.from({ length:size*size }, (_,index)=>index).filter(index=>!safe.has(index));
  const mines = new Set();
  for (let index = 0; index < count; index += 1) {
    const slot = Math.floor(random() * pool.length);
    mines.add(pool[slot]);
    pool[slot] = pool.at(-1);
    pool.pop();
  }
  const numbers = Array.from({ length:size*size }, (_,index)=>neighbors(index,size).filter(cell=>mines.has(cell)).length);
  return { mines, numbers };
}

export function openArea(index, size, field, revealed, flags) {
  const queue = [index];
  while (queue.length) {
    const cell = queue.pop();
    if (revealed.has(cell) || flags.has(cell) || field.mines.has(cell)) continue;
    revealed.add(cell);
    if (field.numbers[cell] === 0) queue.push(...neighbors(cell,size));
  }
}

export function mountMines(api) {
  const key='mines:match';
  const restored=load(key,null);
  let mode = 0, board, cells, flags, revealed, state, markMode, size, total, startTime, hit;
  let alreadyElapsed = 0;

  function persist() {
    save(key,{mode,mines:board?[...board.mines]:null,flags:[...flags],revealed:[...revealed],state,elapsed:elapsed(),hit});
  }
  let records = load('mines', {});
  const select = api.select('扫雷难度', difficulties.map(([,count,name],id)=>[id,`${name} · ${count} 雷`]), start);
  const modeButton = document.createElement('button');
  modeButton.type = 'button';
  modeButton.className = 'quiet puzzle-mode';
  api.stage.after(modeButton);
  modeButton.onclick = () => {
    markMode = !markMode;
    renderMode();
  };

  function renderMode() {
    modeButton.textContent = markMode ? '当前插旗 · 切换翻格' : '当前翻格 · 切换插旗';
    modeButton.setAttribute('aria-pressed', String(markMode));
  }

  function start(option = mode) {
    mode = Number(option);
    select(mode);
    [size,total] = difficulties[mode];
    board = null;
    flags = new Set();
    revealed = new Set();
    state = 'play';
    markMode = false;
    hit = -1;
    startTime = 0;
    alreadyElapsed = 0;
    cells = puzzleGrid(api.stage,size,'扫雷棋盘', index=>markMode ? mark(index) : uncover(index),mark);
    api.hideOverlay();
    api.message('第一格及周围安全');
    renderMode();
    persist();
    render();
  }

  function elapsed() { return alreadyElapsed + (startTime ? Math.floor((Date.now()-startTime)/1000) : 0); }

  function status() {
    api.hud(['剩余雷数',total-flags.size],['用时',elapsed()+' 秒'],['最佳',records[mode] === undefined ? '—' : records[mode]+' 秒']);
  }

  function render() {
    status();
    cells.forEach((cell,index) => {
      const shown = revealed.has(index);
      const flagged = flags.has(index);
      const mine = state === 'lost' && board.mines.has(index);
      const number = shown ? board.numbers[index] : 0;
      cell.dataset.open = String(shown || mine);
      cell.dataset.mark = index === hit ? 'hit' : mine ? 'mine' : flagged ? 'flag' : '';
      cell.dataset.number = number || '';
      cell.textContent = mine ? '✹' : flagged ? '⚑' : number || '';
      const value = mine ? '地雷' : flagged ? '已插旗' : number ? `周围 ${number} 雷` : shown ? '安全空格' : '未翻开';
      cell.setAttribute('aria-label',`第 ${Math.floor(index/size)+1} 行第 ${index%size+1} 列，${value}`);
    });
  }

  function mark(index) {
    if (state !== 'play' || revealed.has(index)) return;
    if (!flags.delete(index) && flags.size < total) flags.add(index);
    api.play('flag');
    persist();
    render();
  }

  function uncover(index) {
    if (state !== 'play' || flags.has(index)) return;
    if (!board) {
      board = minefield(size,total,index);
      startTime = Date.now();
      api.message('翻开所有安全格');
    }
    let targets = [index];
    if (revealed.has(index)) {
      const around = neighbors(index,size);
      if (!board.numbers[index] || around.filter(cell=>flags.has(cell)).length !== board.numbers[index]) return;
      targets = around.filter(cell=>!flags.has(cell));
    }
    hit = targets.find(cell=>board.mines.has(cell)) ?? -1;
    if (hit >= 0) {
      state = 'lost';
      api.play('fail');
    } else {
      for (const cell of targets) openArea(cell,size,board,revealed,flags);
      if (revealed.size === size*size-total) {
        state = 'won';
        records[mode] = Math.min(records[mode] ?? Infinity, elapsed());
        save('mines',records);
        api.play('clear');
      } else api.play('open');
    }
    persist();
    render();
    if (state !== 'play') {
      api.overlay(state === 'won' ? '雷区清空' : '触雷了',`翻开 ${revealed.size} 格 · ${elapsed()} 秒`,[['再来一局',()=>start()],['看棋盘',api.hideOverlay]]);
    }
  }
  const timer = setInterval(()=>{ if (state === 'play' && startTime) { status(); persist(); } },1000);
  api.signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
  api.restart(()=>start());
  if (difficulties[restored?.mode] && Array.isArray(restored.flags) && Array.isArray(restored.revealed)) {
    mode=restored.mode;
    select(mode);
    [size,total]=difficulties[mode];
    if (restored.mines) {
      const mines=new Set(restored.mines);
      board={mines,numbers:Array.from({length:size*size},(_,index)=>neighbors(index,size).filter(cell=>mines.has(cell)).length)};
    }
    flags=new Set(restored.flags);
    revealed=new Set(restored.revealed);
    state=restored.state;
    markMode=false;
    hit=restored.hit;
    alreadyElapsed=restored.elapsed;
    startTime=board && state==='play'?Date.now():0;
    cells=puzzleGrid(api.stage,size,'扫雷棋盘',index=>markMode?mark(index):uncover(index),mark);
    api.message(!board?'第一格及周围安全':state==='play'?'翻开所有安全格':state==='won'?'雷区清空':'触雷了');
    renderMode();
    render();
  } else start();
}
