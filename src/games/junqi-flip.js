import { load, save } from '../engine.js';
import { drawJunqiGrid, junqiCamp, junqiInventory, junqiPieceNames, shuffleJunqi, junqiMove } from './junqi.js';
import { puzzleGrid } from './puzzle-grid.js';

const ranks={F:50,M:5,B:7,1:4,2:4,3:5,4:6,5:7,6:8,7:10,8:14,9:18};
const difficulties=[['easy','入门'],['normal','标准'],['hard','困难']];
const colorName=color=>color===0?'红方':'蓝方';

export function createFlipMatch(random=Math.random) {
  const pieces=shuffleJunqi([0,1].flatMap(side=>junqiInventory.map(type=>({side,type}))),random);
  return {
    board:Array.from({length:60},(_,i)=>junqiCamp(i)?null:pieces.pop()),
    shown:[],colors:[null,null],last:[null,null],mines:[3,3],side:0,count:0,quiet:0,winner:null,
  };
}

function visibleBoard(state) {
  const known=new Set(state.shown);
  return state.board.map((piece,index)=>piece&&(known.has(index)?piece:{hidden:true}));
}

export function flipMove(board,from,to,color,mines) {
  const attacker=board[from], defender=board[to];
  if(color===null||attacker?.side!==color||defender?.hidden) return null;
  if(defender) {
    if(defender.type==='F'&&mines[defender.side]>0) return null;
    if(defender.type==='M'&&!['1','B'].includes(attacker.type)) return null;
    if(Number(attacker.type)<Number(defender.type)) return null;
  }
  return junqiMove(board,from,to,true);
}

function visibleMoves(board,color,mines) {
  if(color===null) return [];
  const moves=[];
  for(const [from,piece] of board.entries()) {
    if(piece?.side!==color||['M','F'].includes(piece.type)) continue;
    for(let to=0;to<board.length;to++) {
      const next=flipMove(board,from,to,color,mines);
      if(next) moves.push({from,to,next});
    }
  }
  return moves;
}

function finishTurn(state,flagCaptured=false) {
  const player=state.side;
  state.count++;
  state.side=1-player;
  if(flagCaptured){state.winner=player;return;}
  const visible=visibleBoard(state);
  if(state.colors[0]===null&&visible.every(piece=>!piece?.hidden)) {
    state.colors=[state.last[0]??0,1-(state.last[0]??0)];
  }
  if(state.quiet>=40) {state.winner=2;return;}
  if(visible.some(piece=>piece?.hidden)) return;
  const mobile=state.colors.map(color=>state.board.some(piece=>piece?.side===color&&!['F','M'].includes(piece.type)));
  if(!mobile[0]&&!mobile[1]) {state.winner=2;return;}
  if(!mobile[state.side]||!visibleMoves(visible,state.colors[state.side],state.mines).length) state.winner=player;
}

export function revealFlip(state,index) {
  if(state.winner!==null||!state.board[index]||state.shown.includes(index)) return false;
  const color=state.board[index].side, player=state.side;
  state.shown.push(index);
  if(state.colors[0]===null&&state.last[player]===color) {
    state.colors[player]=color;
    state.colors[1-player]=1-color;
  }
  state.last[player]=color;
  state.quiet=0;
  finishTurn(state);
  return true;
}

export function playFlip(state,from,to) {
  if(state.winner!==null) return false;
  const visible=visibleBoard(state);
  const next=flipMove(visible,from,to,state.colors[state.side],state.mines);
  if(!next) return false;
  const target=visible[to];
  if(target?.type==='M') state.mines[target.side]--;
  state.board[from]=null;
  state.board[to]=next[to];
  state.shown=state.shown.filter(index=>index!==from&&index!==to);
  if(state.board[to]) state.shown.push(to);
  state.quiet=target?0:state.quiet+1;
  finishTurn(state,target?.type==='F');
  return true;
}

export function flipComputer(state,difficulty,random=Math.random) {
  const board=visibleBoard(state);
  const color=state.colors[state.side];
  const dark=board.flatMap((piece,index)=>piece?.hidden?[index]:[]);
  const moves=visibleMoves(board,color,state.mines);
  if(!moves.length) return dark.length?{flip:dark[Math.floor(random()*dark.length)]}:null;
  if(difficulty==='easy' && (random()<.43||!dark.length)) {
    const {from,to}=moves[Math.floor(random()*moves.length)];
    return {from,to};
  }
  let best=null,score=-Infinity;
  for(const move of moves) {
    const target=board[move.to], source=board[move.from];
    let value=target?(ranks[target.type]??0):0;
    if(target&&!move.next[move.to]) value-=ranks[source.type]*.82;
    if(junqiCamp(move.to)) value+=1.25;
    value+=(4-Math.abs(move.to%5-2))*.15+random()*.7;
    if(difficulty==='hard'&&move.next[move.to]&&target?.type!=='F') {
      for(const [index,attacker] of move.next.entries()) {
        if(!attacker||attacker.side!==1-color) continue;
        if(flipMove(move.next,index,move.to,1-color,state.mines)) {value-=ranks[source.type]*.65;break;}
      }
    }
    if(value>score) {score=value;best=move;}
  }
  if(dark.length&&score<(difficulty==='hard'?2.3:3.4)) {
    return {flip:dark[Math.floor(random()*dark.length)]};
  }
  return {from:best.from,to:best.to};
}

export function mountJunqiFlip(api) {
  const levels=difficulties.map(([level])=>level);
  const difficultyPreference=load('junqi-flip:difficulty','normal');
  let difficulty=levels.includes(difficultyPreference)?difficultyPreference:'normal';
  let mode='ai', state, selected=-1, timer;
  const seat=player=>mode==='ai'?(player===0?'你':'电脑'):'棋手 '+(player+1);
  const key=()=>`junqi-flip:${mode}-match`;
  api.select('对局',[['ai','人机'],['local','双人']],value=>{mode=value;openMatch();});
  const selectDifficulty=api.select('翻翻棋难度',difficulties,value=>{difficulty=value; save('junqi-flip:difficulty',difficulty);});
  selectDifficulty(difficulty);

  const table=document.createElement('div');
  table.className='junqi-table';
  table.innerHTML='<div class="junqi-seats"></div><div class="junqi-board-host"></div><p class="junqi-help" role="status"></p>';
  api.stage.append(table);
  const info=table.querySelector('.junqi-help'), seats=table.querySelector('.junqi-seats');
  const cells=puzzleGrid(table.querySelector('.junqi-board-host'),5,'军棋翻翻棋棋盘',choose,null,12);
  const grid=cells[0].parentElement;
  drawJunqiGrid(grid,cells);

  function openMatch(restart=false) {
    clearTimeout(timer);
    const previous=restart?null:load(key(),null);
    state=previous?.board?.length===60&&Array.isArray(previous.shown)&&Array.isArray(previous.colors)?previous:createFlipMatch();
    selected=-1;
    api.hideOverlay();
    frame();
  }
  function waiting() { return mode==='ai'&&state.side===1&&state.winner===null; }
  function choose(index) {
    if(waiting()||state.winner!==null) return;
    const color=state.colors[state.side], piece=state.board[index];
    if(piece&&!state.shown.includes(index)) {
      if(revealFlip(state,index)) {selected=-1;api.play('move');frame();}
      return;
    }
    if(piece&&piece.side===color) {
      selected=selected===index?-1:index;
      paint();
      return;
    }
    if(selected>=0) {
      if(playFlip(state,selected,index)) {selected=-1;api.play('move');frame();}
      else {
        info.textContent=piece?.type==='F'&&state.mines[piece.side]>0
          ?'对方军旗仍受地雷保护。先清除对方地雷。'
          :'这个点走不到，或不能吃该棋子。';
      }
    }
  }
  function frame() {
    save(key(),state);
    paint();
    if(waiting()) timer=setTimeout(()=>{
      const option=flipComputer(state,difficulty);
      if(!option) state.winner=0;
      else if(option.flip!==undefined) revealFlip(state,option.flip);
      else playFlip(state,option.from,option.to);
      api.play('move');
      frame();
    },280);
    else if(state.winner!==null) {
      const title=state.winner===2?'和局':seat(state.winner)+'获胜';
      api.play('clear');
      api.overlay(title,`共 ${state.count} 手`,[['再来一局',()=>openMatch(true)],['回看棋盘',api.hideOverlay]]);
    }
  }
  function paint() {
    const board=visibleBoard(state),color=state.colors[state.side];
    const names=['未定阵营','未定阵营'];
    state.colors.forEach((side,player)=>{ if(side!==null) names[player]=colorName(side)+' · 雷 '+state.mines[side]; });
    seats.replaceChildren(...names.map((name,player)=>{
      const badge=document.createElement('div');
      badge.dataset.active=String(player===state.side&&state.winner===null);
      badge.dataset.color=String(state.colors[player]??'');
      badge.textContent=seat(player)+' · '+name;
      return badge;
    }));
    api.hud(['回合',state.winner===null?seat(state.side):'对局结束'],['手数',state.count]);
    const last=state.last[state.side];
    info.textContent=state.winner!==null?'对局已结束':waiting()?'电脑正在思考…':
      color===null?(last===null?'先翻任意暗子。自己连续两次翻到同色即可定阵营。':'上次你翻到'+colorName(last)+'。再翻到同色就能确定阵营。'):
      '每回合可翻一枚暗子，或走一枚己方明子。先清掉对方地雷，再夺旗。';
    cells.forEach((cell,index)=>{
      const piece=board[index];
      const lit=piece&&!piece.hidden;
      const label=piece?(lit?colorName(piece.side)+' '+junqiPieceNames[piece.type]:'未翻暗子'):junqiCamp(index)?'空行营':'空兵站';
      cell.dataset.selected=String(index===selected);
      cell.dataset.legal=String(selected>=0&&Boolean(flipMove(board,selected,index,color,state.mines)));
      cell.dataset.piece=lit?String(piece.side):piece?'face-down':'';
      cell.setAttribute('aria-label',`第 ${Math.floor(index/5)+1} 行第 ${index%5+1} 列，${label}`);
      cell.setAttribute('aria-disabled',String(waiting()||state.winner!==null));
      if(piece) {
        const token=document.createElement('span');
        token.textContent=lit?junqiPieceNames[piece.type]:'？';
        if(lit&&piece.type==='F'&&state.mines[piece.side]) token.dataset.guarded='true';
        cell.replaceChildren(token);
      } else cell.replaceChildren();
    });
  }
  api.restart(()=>openMatch(true));
  api.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  openMatch();
}
