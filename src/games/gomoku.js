import { clamp, load, save } from '../engine.js';

export const SIZE=15;
const AXES=[[1,0],[0,1],[1,1],[1,-1]];
const inside=(x,y) => x>=0 && y>=0 && x<SIZE && y<SIZE;
const at=(x,y) => y*SIZE+x;

function line(board,id,stone,dx,dy) {
  const x=id%SIZE,y=Math.floor(id/SIZE);
  const cells=[id];
  let open=0;
  for (const side of [-1,1]) {
    let xx=x+dx*side,yy=y+dy*side;
    while (inside(xx,yy) && board[at(xx,yy)]===stone) {
      cells.push(at(xx,yy)); xx+=dx*side; yy+=dy*side;
    }
    if (inside(xx,yy) && !board[at(xx,yy)]) open+=1;
  }
  return { cells,open };
}

export function winLine(board,id,stone) {
  for (const [dx,dy] of AXES) {
    const {cells}=line(board,id,stone,dx,dy);
    if (cells.length>=5) return cells;
  }
  return [];
}

export function machineMove(board,difficulty='normal') {
  const center=at(7,7);
  if (!board.some(Boolean)) return center;
  const weights=[[0,0,0],[0,1,2],[0,8,35],[0,48,350],[0,540,3000]];
  let best=-1,bestScore=-Infinity;
  const choices=[];
  for (let id=0;id<board.length;id+=1) {
    if (board[id]) continue;
    if (winLine(board,id,2).length) return id;
    const blocksWin=winLine(board,id,1).length>0;
    let score=blocksWin?(difficulty==='easy'?400:100000):0;
    for (const [dx,dy] of AXES) {
      for (const stone of [1,2]) {
        const {cells,open}=line(board,id,stone,dx,dy);
        score+=(weights[Math.min(4,cells.length)][open])*(stone===2?1.03:difficulty==='easy'?.32:1);
      }
    }
    score-=.05*(Math.abs(id%SIZE-7)+Math.abs(Math.floor(id/SIZE)-7));
    choices.push([id,score]);
    if (score>bestScore) { best=id; bestScore=score; }
  }
  if (difficulty !== 'hard' || bestScore >= 100000 || best < 0) return best;
  const candidates=choices.sort((a,b)=>b[1]-a[1]).slice(0,10);
  let strongest=-Infinity;
  for (const [id,score] of candidates) {
    const next=board.slice();
    next[id]=2;
    let myThreats=0, rivalThreats=0;
    for (let cell=0;cell<next.length;cell+=1) {
      if (next[cell]) continue;
      if (winLine(next,cell,2).length) myThreats+=1;
      if (winLine(next,cell,1).length) rivalThreats+=1;
    }
    const evaluated = score + (myThreats>1?25000:myThreats*190) - rivalThreats*18000;
    if (evaluated>strongest) { strongest=evaluated; best=id; }
  }
  return best;
}

export function mountGomoku(api) {
  const grid=document.createElement('div');
  grid.className='gomoku-grid';
  grid.setAttribute('role','group');
  grid.setAttribute('aria-label','五子棋棋盘');
  api.stage.append(grid);
  const resume=load('gomoku:match',null);
  let mode=resume?.mode==='local'?'local':'ai';
  let difficulty=['easy','normal','hard'].includes(resume?.difficulty)?resume.difficulty:'normal';
  let board,history,turn,result,winning,focusId,timer;
  let wins=load('gomoku',0);
  const undo=document.createElement('button');
  undo.className='action';
  undo.textContent='悔棋';
  api.stage.parentElement.querySelector('.action-buttons').append(undo);
  const cells=Array.from({length:SIZE*SIZE},(_,id) => {
    const cell=document.createElement('button');
    cell.type='button'; cell.className='intersection';
    cell.onclick=() => { setFocus(id); place(id); };
    cell.addEventListener('focus',() => setFocus(id),{signal:api.signal});
    grid.append(cell);
    return cell;
  });
  grid.addEventListener('keydown',event => {
    const vectors={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if (!vectors[event.key]) return;
    event.preventDefault();
    const [dx,dy]=vectors[event.key];
    const next=at(clamp(focusId%SIZE+dx,0,SIZE-1),clamp(Math.floor(focusId/SIZE)+dy,0,SIZE-1));
    cells[next].focus();
  },{signal:api.signal});
  const selectMode=api.select('对局',[['ai','人机'],['local','双人']],value => { mode=value; start(); });
  const selectDifficulty=api.select('五子棋难度',[['easy','入门'],['normal','标准'],['hard','困难']],value => {
    difficulty=value;
    persist();
  });

  function persist() { save('gomoku:match',{mode,difficulty,history,turn,result}); }
  function scheduleMachine() {
    if (!result && mode==='ai' && turn===2) timer=setTimeout(()=>place(machineMove(board,difficulty),true),260);
  }
  function setFocus(id) {
    if (focusId!==undefined) cells[focusId].tabIndex=-1;
    focusId=id;
    cells[id].tabIndex=0;
  }
  function start() {
    clearTimeout(timer);
    board=new Uint8Array(SIZE*SIZE); history=[]; turn=1; result=0; winning=[];
    api.hideOverlay(); setFocus(at(7,7)); persist(); render();
  }
  function render() {
    api.hud(['回合',result?'已结束':turn===1?'黑方':'白方'],['手数',history.length],...(mode==='ai'?[['人机胜局',wins]]:[]));
    api.message(result===3?'棋盘已满':result?((result===1?'黑方':'白方')+'获胜'):turn===2&&mode==='ai'?'电脑思考中…':'黑方先手 · 自由连五');
    undo.disabled=!history.length || Boolean(result);
    for (const [id,cell] of cells.entries()) {
      const stone=board[id];
      if (stone) cell.dataset.stone=stone; else delete cell.dataset.stone;
      cell.toggleAttribute('data-last',id===history.at(-1));
      cell.toggleAttribute('data-win',winning.includes(id));
      cell.setAttribute('aria-disabled',String(Boolean(stone || result || (turn===2 && mode==='ai'))));
      cell.setAttribute('aria-label',`第 ${Math.floor(id/SIZE)+1} 行，第 ${id%SIZE+1} 列${stone===1?'，黑子':stone===2?'，白子':''}`);
    }
  }
  function place(id,computer=false) {
    if (id<0 || board[id] || result || (mode==='ai' && turn===2 && !computer)) return;
    board[id]=turn; history.push(id); api.play(turn === 1 ? 'black' : 'white');
    winning=winLine(board,id,turn);
    if (winning.length) {
      result=turn;
      if (mode==='ai' && result===1) { wins+=1; save('gomoku',wins); }
    } else if (history.length===board.length) result=3;
    else turn=3-turn;
    persist();
    render();
    if (result) {
      api.play(result === 3 ? 'draw' : 'clear');
      const text=result===3?'和棋':result===1?'黑方获胜':'白方获胜';
      api.overlay(text,`本局 ${history.length} 手`,[['再来一局',start],['查看棋盘',api.hideOverlay]]);
    } else scheduleMachine();
  }
  undo.onclick=() => {
    if (!history.length || result) return;
    clearTimeout(timer);
    board[history.pop()]=0;
    api.play('undo');
    if (mode==='ai') {
      if (turn===1 && history.length) board[history.pop()]=0;
      turn=1;
    } else turn=3-turn;
    persist();
    render();
  };
  api.restart(start);
  api.signal.addEventListener('abort',() => clearTimeout(timer),{once:true});
  selectMode(mode);
  selectDifficulty(difficulty);
  if (Array.isArray(resume?.history) && resume.history.length<=SIZE*SIZE
    && resume.history.every(id=>Number.isInteger(id) && id>=0 && id<SIZE*SIZE)
    && new Set(resume.history).size===resume.history.length) {
    history=resume.history;
    board=new Uint8Array(SIZE*SIZE);
    history.forEach((cell,index)=>{ board[cell]=index%2+1; });
    turn=resume.turn===2?2:1;
    result=[1,2,3].includes(resume.result)?resume.result:0;
    winning=(result===1||result===2)&&history.length?winLine(board,history.at(-1),result):[];
    setFocus(history.at(-1) ?? at(7,7));
    render();
    scheduleMachine();
  } else start();
}
