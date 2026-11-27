import { load, save } from '../engine.js';
import { puzzleGrid } from './puzzle-grid.js';

const sizes = [5,7,9];
const directions = [[0,-1],[1,0],[0,1],[-1,0]];
const names = ['上','右','下','左'];

export function turn(mask) { return ((mask << 1) & 15) | (mask >> 3); }

function adjacent(index, direction, size) {
  const [dx,dy] = directions[direction];
  const x = index % size + dx, y = Math.floor(index / size) + dy;
  return x >= 0 && x < size && y >= 0 && y < size ? y * size + x : -1;
}

export function powered(board, size, source) {
  const lit = new Set([source]);
  const queue = [source];
  while (queue.length) {
    const index = queue.pop();
    for (let direction = 0; direction < 4; direction += 1) {
      if (!(board[index] & (1 << direction))) continue;
      const other = adjacent(index,direction,size);
      if (other < 0 || lit.has(other) || !(board[other] & (1 << ((direction+2)%4)))) continue;
      lit.add(other);
      queue.push(other);
    }
  }
  return lit;
}

export function makeCircuit(size, random = Math.random) {
  const source = Math.floor(size*size/2);
  const solution = new Array(size*size).fill(0);
  const linked = new Set([source]);
  const frontier = [source];
  while (frontier.length) {
    const slot = Math.floor(random()*frontier.length);
    const index = frontier[slot];
    const choices = directions.map((_,dir)=>[dir,adjacent(index,dir,size)]).filter(([,other])=>other>=0 && !linked.has(other));
    if (!choices.length) {
      frontier[slot] = frontier.at(-1);
      frontier.pop();
      continue;
    }
    const [direction,other] = choices[Math.floor(random()*choices.length)];
    solution[index] |= 1 << direction;
    solution[other] |= 1 << ((direction+2)%4);
    linked.add(other);
    frontier.push(other);
  }
  const board = solution.map(mask=>{
    const turns = Math.floor(random()*4);
    for(let step=0;step<turns;step+=1) mask=turn(mask);
    return mask;
  });
  if (powered(board,size,source).size === board.length) {
    const end = solution.findIndex((mask,index)=>index!==source && (mask & (mask-1))===0);
    board[end] = turn(board[end]);
  }
  return { source, board, solution };
}

export function mountCircuit(api) {
  const key='circuit:match';
  const restored=load(key,null);
  let mode = 0, size, source, board, cells, turns, complete;
  function persist() { save(key,{mode,source,board,turns}); }
  let records = load('circuit', {});
  const select = api.select('电路尺寸',sizes.map((n,index)=>[index,`${n} × ${n}`]),start);
  const segments = directions.map(([x,y])=>`<path d="M12 12L${12+12*x} ${12+12*y}"/>`);

  function start(option=mode) {
    mode = Number(option);
    select(mode);
    size = sizes[mode];
    ({ board, source } = makeCircuit(size));
    turns = 0;
    complete = false;
    cells = puzzleGrid(api.stage,size,'电路棋盘',rotate);
    api.hideOverlay();
    api.message('转动线路，让所有节点通电');
    persist();
    render();
  }

  function rotate(index) {
    if (complete) return;
    const next = turn(board[index]);
    if (next === board[index]) return;
    board[index] = next;
    turns += 1;
    api.play('turn');
    persist();
    render();
  }

  function render() {
    const lit = powered(board,size,source);
    complete = lit.size === board.length;
    if (complete) {
      records[mode] = Math.min(records[mode] ?? Infinity,turns);
      save('circuit',records);
    }
    api.hud(['通电',`${lit.size}/${board.length}`],['转动',turns],['最佳',records[mode] ?? '—']);
    cells.forEach((cell,index)=>{
      const endpoints = names.filter((_,direction)=>board[index] & (1 << direction));
      const paths = segments.filter((_,direction)=>board[index] & (1 << direction)).join('');
      cell.dataset.lit = String(lit.has(index));
      cell.dataset.source = String(index === source);
      cell.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}<circle cx="12" cy="12" r="${index===source?4:2.6}"/></svg>`;
      cell.setAttribute('aria-label',`第 ${Math.floor(index/size)+1} 行第 ${index%size+1} 列，${index===source?'电源，':''}${endpoints.join('、')}，${lit.has(index)?'已通电':'未通电'}`);
    });
    if (complete) {
      api.play('clear');
      api.overlay('全线通电',`转动 ${turns} 次`,[['下一局',()=>start()],['查看线路',api.hideOverlay]]);
    }
  }
  api.restart(()=>start());
  if (Number.isInteger(restored?.mode) && restored.board?.length === sizes[restored.mode]**2
    && restored.board.every(mask=>Number.isInteger(mask)&&mask>0&&mask<=15)) {
    ({mode,source,board,turns}=restored);
    size=sizes[mode];
    select(mode);
    cells=puzzleGrid(api.stage,size,'电路棋盘',rotate);
    api.message('转动线路，让所有节点通电');
    render();
  } else start();
}
