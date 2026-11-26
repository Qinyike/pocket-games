import { load, loop, save } from '../engine.js';
import { rect } from '../art.js';

export const COLS=10, ROWS=18;
const SIZE=15;
const SHAPES=[
  { color:'#67d8c9',cells:[[0,1],[1,1],[2,1],[3,1]],size:4 },
  { color:'#f0c066',cells:[[0,0],[1,0],[0,1],[1,1]],size:2 },
  { color:'#c993f5',cells:[[1,0],[0,1],[1,1],[2,1]],size:3 },
  { color:'#8fe295',cells:[[1,0],[2,0],[0,1],[1,1]],size:3 },
  { color:'#f48f8f',cells:[[0,0],[1,0],[1,1],[2,1]],size:3 },
  { color:'#849dff',cells:[[0,0],[0,1],[1,1],[2,1]],size:3 },
  { color:'#f3a878',cells:[[2,0],[0,1],[1,1],[2,1]],size:3 },
  { color:'#edbade',cells:[[0,0],[0,1],[1,1]],size:2 },
];
export const emptyRow=() => Array(COLS).fill(null);
export function clearRows(board) {
  const remaining=board.filter(row => row.some(cell => cell===null));
  const count=board.length-remaining.length;
  return { board:[...Array.from({length:count},emptyRow),...remaining],count };
}

export function mountBlocks(api) {
  const canvas=api.canvas(243,282,'落块棋盘和预览');
  api.stage.classList.add('blocks-stage');
  const ctx=canvas.getContext('2d');
  let board, piece, queued, held, usedHold, bag, score, lines, mode, gravity, lock, lockResets, repeat, combo;
  let best=load('blocks',0);
  const control=api.controls({ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',ArrowDown:'down',KeyX:'rotate',KeyZ:'counter',Space:'drop',KeyC:'hold',KeyP:'pause',Escape:'pause'},[
    ['left','←',false,'左移'],['right','→',false,'右移'],['rotate','旋转'],['down','↓',false,'软降'],['drop','硬降',true],['hold','暂存'],['pause','暂停'],
  ],act,() => mode==='play');
  function pull() {
    if (!bag.length) {
      bag=SHAPES.map((_,i) => i);
      for (let i=bag.length-1;i>0;i-=1) {
        const j=Math.floor(Math.random()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]];
      }
    }
    return bag.pop();
  }
  function hud() { api.hud(['得分',score],['消行',lines],['速度',1+Math.floor(lines/5)],['纪录',Math.max(score,best)]); }
  function newPiece(kind) {
    piece={ kind,x:3,y:-1,cells:SHAPES[kind].cells };
    lock=0; gravity=0; lockResets=0;
    if (!fits(piece)) end();
  }
  function spawn() { const next=queued; queued=pull(); usedHold=false; newPiece(next); }
  function start() {
    board=Array.from({length:ROWS},emptyRow); bag=[]; queued=pull(); held=null;
    score=lines=combo=0; mode='play'; repeat=null;
    control.clear(); api.hideOverlay(); api.message('消行得分，连续消行有加成');
    spawn(); hud();
  }
  function fits(test) {
    return test.cells.every(([x,y]) => {
      const col=x+test.x,row=y+test.y;
      return col>=0 && col<COLS && row<ROWS && (row<0 || board[row][col]===null);
    });
  }
  function lower() { return shift(0,1); }
  function shift(dx,dy) {
    const candidate={...piece,x:piece.x+dx,y:piece.y+dy};
    if (!fits(candidate)) return false;
    piece=candidate;
    if (dy) lock=0;
    else resetLock();
    return true;
  }
  function resetLock() { if (lock>0 && lockResets<10) { lockResets+=1; lock=0; } }
  function rotate(clockwise) {
    const {size}=SHAPES[piece.kind];
    const cells=piece.cells.map(([x,y]) => clockwise?[size-1-y,x]:[y,size-1-x]);
    for (const [dx,dy] of [[0,0],[-1,0],[1,0],[0,-1],[-2,0],[2,0]]) {
      const candidate={...piece,cells,x:piece.x+dx,y:piece.y+dy};
      if (fits(candidate)) { piece=candidate; resetLock(); api.play('rotate'); return; }
    }
  }
  function end() {
    mode='end';
    if (score>best) { best=score; save('blocks',best); }
    api.overlay('棋盘已满',`得分 ${score} · 消除 ${lines} 行`,[['再来一局',start]]);
    api.play('fail');
  }
  function settle() {
    if (piece.cells.some(([,y]) => piece.y+y<0)) { end(); return; }
    for (const [x,y] of piece.cells) board[piece.y+y][piece.x+x]=piece.kind;
    const result=clearRows(board);
    board=result.board;
    if (result.count) {
      combo+=1; lines+=result.count;
      score+=100*result.count*result.count+25*(combo-1);
      api.message(combo>1?'连消 × '+combo:'消除 '+result.count+' 行');
      api.play(combo > 1 || result.count >= 3 ? 'combo' : 'line');
    } else { combo=0; api.play('lock'); }
    if (score>best) save('blocks',score);
    spawn(); hud();
  }
  function pause() {
    if (mode!=='play') return;
    mode='paused'; repeat=null;
    api.overlay('已暂停','当前得分 '+score,[['继续',() => { mode='play'; api.hideOverlay(); }]]);
  }
  function act(action) {
    if (action==='pause') { pause(); return; }
    if (action==='left' || action==='right') {
      const dx=action==='left'?-1:1;
      repeat={action,dx,delay:.16};
      if (shift(dx,0)) api.play('move');
    } else if (action==='rotate' || action==='counter') rotate(action==='rotate');
    else if (action==='down') { if(lower()) { score+=1; hud(); } gravity=0; }
    else if (action==='drop') {
      while (lower()) score+=2;
      settle();
    } else if (action==='hold' && !usedHold) {
      const next=held;
      held=piece.kind;
      if (next===null) spawn(); else newPiece(next);
      usedHold=true;
      api.play('hold');
    }
  }
  function update(dt) {
    if (mode!=='play') return;
    if (repeat && control.held(repeat.action)) {
      repeat.delay-=dt;
      if (repeat.delay<=0) { repeat.delay=.062; shift(repeat.dx,0); }
    }
    const soft=control.held('down');
    const rate=soft?.055:Math.max(.09,.80*.84**Math.floor(lines/5));
    gravity+=dt;
    if (gravity>=rate) {
      gravity-=rate;
      if (lower() && soft) { score+=1; hud(); }
    }
    if (fits({...piece,y:piece.y+1})) lock=0;
    else if ((lock+=dt)>=.45) settle();
  }
  function tile(x,y,color,size=SIZE) {
    rect(ctx,color,x,y,size-1,size-1); rect(ctx,'#ffffff58',x,y,size-1,2); rect(ctx,'#00000030',x,y+size-3,size-1,2);
  }
  function draw() {
    rect(ctx,'#14182b',0,0,243,282);
    rect(ctx,'#0d1120',5,5,COLS*SIZE+2,ROWS*SIZE+2);
    for (let y=0;y<ROWS;y+=1) for (let x=0;x<COLS;x+=1) {
      const kind=board[y][x], xx=6+x*SIZE, yy=6+y*SIZE;
      if(kind===null) rect(ctx,'#1c2136',xx,yy,SIZE-1,SIZE-1);
      else tile(xx,yy,SHAPES[kind].color);
    }
    if (fits(piece)) {
      const ghost={...piece};
      while (fits({...ghost,y:ghost.y+1})) ghost.y+=1;
      for (const [x,y] of ghost.cells) if (ghost.y+y>=0) {
        const xx=6+(ghost.x+x)*SIZE, yy=6+(ghost.y+y)*SIZE;
        rect(ctx,'#4d5474',xx+3,yy+3,SIZE-7,SIZE-7);
      }
      for (const [x,y] of piece.cells) if(piece.y+y>=0) tile(6+(piece.x+x)*SIZE,6+(piece.y+y)*SIZE,SHAPES[piece.kind].color);
    }
    for (const [label,id,y] of [['下一块',queued,12],['暂存',held,109]]) {
      ctx.font='12px sans-serif'; ctx.fillStyle='#c7c9e5'; ctx.fillText(label,170,y+12);
      rect(ctx,'#202741',165,y+21,70,55);
      if (id!==null) for (const [x,yy] of SHAPES[id].cells) tile(173+x*13,y+25+yy*13,SHAPES[id].color,13);
    }
  }
  api.restart(start);
  document.addEventListener('visibilitychange',() => { if(document.hidden) pause(); },{signal:api.signal});
  start();
  loop(api.signal,update,draw);
}
