import { load, save } from '../engine.js';
import { drawJunqiGrid, JUNQI_GAP, junqiCamp, junqiInventory, junqiPieceNames, shuffleJunqi, junqiMove, junqiMoveRoute } from './junqi.js';
import { puzzleGrid } from './puzzle-grid.js';

const ranks={F:1000,M:6,B:10,1:6,2:3,3:4,4:5,5:6,6:8,7:10,8:14,9:19};
const difficulties=[['easy','入门'],['normal','标准'],['hard','困难']];
const colorName=color=>color===0?'红方':'蓝方';
const row=index=>Math.floor(index/5);
const distance=(a,b)=>Math.abs(a%5-b%5)+Math.abs(row(a)-row(b));
const coordinate=index=>'ABCDE'[index%5]+(row(index)+1);
const mobile=piece=>piece&&!piece.hidden&&piece.type!=='F'&&piece.type!=='M';

export function createFlipMatch(random=Math.random) {
  const pieces=shuffleJunqi([0,1].flatMap(side=>junqiInventory.map(type=>({side,type}))),random);
  return {
    board:Array.from({length:60},(_,i)=>junqiCamp(i)?null:pieces.pop()),
    shown:[],colors:[null,null],last:[null,null],mines:[3,3],side:0,count:0,quiet:0,winner:null,history:[],captured:[],
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

function visibleMoves(board,color,mines,captureOnly=false) {
  if(color===null) return [];
  const moves=[];
  for(const [from,piece] of board.entries()) {
    if(piece?.side!==color||!mobile(piece)) continue;
    for(let to=0;to<board.length;to++) {
      if(captureOnly&&(!board[to]||board[to].hidden||board[to].side===color)) continue;
      const next=flipMove(board,from,to,color,mines);
      if(next) moves.push({from,to,next});
    }
  }
  return moves;
}

function remember(state,action) {
  state.history=[...(state.history??[]).slice(-11),{...action,player:state.side,step:state.count+1}];
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
  remember(state,{to:index,piece:state.board[index]});
  finishTurn(state);
  return true;
}

export function playFlip(state,from,to) {
  if(state.winner!==null) return false;
  const visible=visibleBoard(state);
  const next=flipMove(visible,from,to,state.colors[state.side],state.mines);
  if(!next) return false;
  const target=visible[to];
  const attacker=visible[from];
  const survived=Boolean(next[to]);
  remember(state,{from,to,piece:attacker,target,survived,route:junqiMoveRoute(visible,from,to)});
  if(target) {
    state.captured??=[];
    state.captured.push(target);
    if(!survived) state.captured.push(attacker);
  }
  if(target?.type==='M') state.mines[target.side]--;
  state.board[from]=null;
  state.board[to]=next[to];
  state.shown=state.shown.filter(index=>index!==from&&index!==to);
  if(state.board[to]) state.shown.push(to);
  state.quiet=target?0:state.quiet+1;
  finishTurn(state,target?.type==='F');
  return true;
}

function pieceValue(piece,mines) {
  return ranks[piece.type]+(piece.type==='1'?2.2*mines[1-piece.side]:0);
}

function moveValue(board,move,mines) {
  const target=board[move.to], unit=board[move.from];
  if(target?.type==='F') return ranks.F;
  const gain=target?pieceValue(target,mines):0;
  const loss=move.next[move.to]?0:pieceValue(unit,mines);
  return gain-loss;
}

function afterMove(mines,target) {
  return target?.type==='M'?mines.map((count,color)=>count-Number(color===target.side)):mines;
}

function placement(board,move,mines) {
  const {from,to}=move;
  const unit=board[from], target=board[to];
  if(!move.next[to]) return 0;
  const keyPiece=unit.type==='1'&&mines[1-unit.side]>0 || Number(unit.type)>=7;
  const shelter=(Number(junqiCamp(to))-Number(junqiCamp(from)))*(keyPiece?1.35:.65);
  const objective=board.reduce((best,piece,index)=>{
    if(piece?.side!==1-unit.side) return best;
    const important=piece.type==='F'&&!mines[piece.side] || unit.type==='1'&&piece.type==='M';
    return important&&(best===null||distance(from,index)<distance(from,best))?index:best;
  },null);
  const approach=objective===null?0:distance(from,objective)-distance(to,objective);
  const center=Math.abs(from%5-2)-Math.abs(to%5-2);
  return shelter+(objective!==null?Math.max(-4,Math.min(4,approach))*.44:center*.11)+(target?.type==='M'&&mines[target.side]===1?2:0);
}

function responseValue(board,color,mines,hard) {
  const replies=visibleMoves(board,color,mines,true);
  let strongest=0;
  for(const reply of replies) {
    const gain=moveValue(board,reply,mines);
    if(gain===ranks.F) return gain;
    if(gain<=strongest) continue;
    let recapture=0;
    if(hard&&reply.next[reply.to]) {
      const nextMines=afterMove(mines,board[reply.to]);
      for(const [from,piece] of reply.next.entries()) {
        if(piece?.side!==1-color||!mobile(piece)) continue;
        const next=flipMove(reply.next,from,reply.to,1-color,nextMines);
        if(next) recapture=Math.max(recapture,moveValue(reply.next,{from,to:reply.to,next},nextMines));
      }
    }
    strongest=Math.max(strongest,gain-.72*recapture);
  }
  return strongest;
}

function attackPressure(board,from,color,mines) {
  if(!mobile(board[from])) return 0;
  let pressure=0;
  for(const [to,target] of board.entries()) {
    if(target?.side!==1-color) continue;
    const next=flipMove(board,from,to,color,mines);
    if(next) pressure=Math.max(pressure,moveValue(board,{from,to,next},mines));
  }
  return Math.min(4,pressure*.29);
}

function unseenInventory(state,board) {
  const pool=[0,1].flatMap(side=>junqiInventory.map(type=>({side,type})));
  for(const piece of [...board,...(state.captured??[])]) {
    if(!piece||piece.hidden) continue;
    const index=pool.findIndex(unit=>unit.side===piece.side&&unit.type===piece.type);
    if(index>=0) pool.splice(index,1);
  }
  return pool;
}

function probe(board,dark,color,state,random) {
  if(color===null) return {index:dark[Math.floor(random()*dark.length)],value:0};
  const own=board.flatMap((piece,index)=>piece?.side===color?[index]:[]);
  const enemy=board.flatMap((piece,index)=>piece?.side===1-color?[index]:[]);
  const candidates=dark.map(index=>{
    const pressure=(positions)=>positions.reduce((sum,point)=>sum+Math.max(0,3-distance(index,point)),0);
    return {index,position:(pressure(own)-pressure(enemy))*.24+random()*.6};
  }).sort((a,b)=>b.position-a.position).slice(0,8);
  const pool=unseenInventory(state,board);
  const possibilities=new Map();
  for(const piece of pool) {
    const key=piece.side+piece.type;
    const known=possibilities.get(key);
    if(known) known.count++;
    else possibilities.set(key,{piece,count:1});
  }
  for(const candidate of candidates) {
    const {index}=candidate;
    const position=board.slice();
    let expectedLoss=0;
    for(const {piece,count} of possibilities.values()) {
      position[index]=piece;
      let loss=0;
      for(const point of piece.side===color?enemy:own) {
        const from=piece.side===color?point:index, to=piece.side===color?index:point;
        const next=flipMove(position,from,to,1-color,state.mines);
        if(next) loss=Math.max(loss,moveValue(position,{from,to,next},state.mines));
      }
      // Blunders at an exposed flag matter even when the unit needed to win is still face-down.
      expectedLoss+=Math.min(loss,55)*count;
    }
    candidate.value=1.3+candidate.position-expectedLoss/(pool.length||1);
  }
  return candidates.reduce((best,candidate)=>candidate.value>best.value?candidate:best);
}

export function flipComputer(state,difficulty,random=Math.random) {
  const board=visibleBoard(state);
  const color=state.colors[state.side];
  const dark=board.flatMap((piece,index)=>piece?.hidden?[index]:[]);
  const moves=visibleMoves(board,color,state.mines);
  const hard=difficulty==='hard', easy=difficulty==='easy';
  if(!moves.length) {
    if(!dark.length) return null;
    return {flip:easy?dark[Math.floor(random()*dark.length)]:probe(board,dark,color,state,random).index};
  }
  const win=moves.find(move=>board[move.to]?.type==='F');
  if(win) return {from:win.from,to:win.to};
  const threat=easy?0:responseValue(board,1-color,state.mines,hard);
  const recent=(state.history??[]).filter(action=>action.player===state.side&&action.from!==undefined).slice(-4);
  let best=null,score=-Infinity;
  for(const move of moves) {
    const {from,to}=move;
    const target=board[to];
    const mines=afterMove(state.mines,target);
    const retaliation=easy?0:responseValue(move.next,1-color,mines,hard);
    const pressure=hard&&move.next[to]&&retaliation<ranks.F
      ?attackPressure(move.next,to,color,mines)-attackPressure(board,from,color,state.mines)
      :0;
    const repetitions=recent.filter(action=>(action.from===from&&action.to===to)||(action.to===from&&action.from===to)).length;
    const value=moveValue(board,move,state.mines)+placement(board,move,state.mines)
      +.88*(threat-retaliation)+pressure+(target?state.quiet*.1:0)-repetitions*1.8+random()*(easy?4.5:.32);
    if(value>score) {score=value;best=move;}
  }
  if(dark.length) {
    const flip=easy?{index:dark[Math.floor(random()*dark.length)],value:2.6}:probe(board,dark,color,state,random);
    if(threat<ranks.F&&score<flip.value) return {flip:flip.index};
  }
  return {from:best.from,to:best.to};
}

function actionText(action) {
  const label=colorName(action.piece.side)+junqiPieceNames[action.piece.type];
  const to=coordinate(action.to);
  if(action.from===undefined) return `翻开 ${to} 的${label}`;
  const path=`${label} ${coordinate(action.from)} → ${to}`;
  if(!action.target) return path;
  const target=junqiPieceNames[action.target.type];
  if(action.target.type==='F') return `${path}，夺旗${action.survived?'':'，炸弹同时损失'}`;
  if(!action.survived) return `${path}，与${target}同归于尽`;
  return `${path}，${action.target.type==='M'?'排除':'吃掉'}${target}`;
}

function invalidMove(attacker,defender,index,mines) {
  if(defender&&junqiCamp(index)) return '对方棋子在行营中，受到保护。';
  if(defender?.type==='F'&&mines[defender.side]>0) return '军旗仍受保护，先清除对方所有地雷。';
  if(defender?.type==='M'&&!['1','B'].includes(attacker.type)) return '工兵和炸弹才能清除地雷。';
  if(defender&&Number(attacker.type)<Number(defender.type)) return '这枚棋子不能吃军衔更高的对手。';
  return '这一步走不到，请选择棋盘上标出的可达点。';
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
  table.innerHTML='<div class="junqi-seats"></div><div class="junqi-last" role="status" aria-atomic="true"></div><div class="junqi-board-host"></div><div class="junqi-notes"><p class="junqi-help" role="status"></p><details class="junqi-history"><summary>战报</summary><ol></ol></details></div>';
  api.stage.append(table);
  const info=table.querySelector('.junqi-help'), seats=table.querySelector('.junqi-seats');
  const latest=table.querySelector('.junqi-last'), history=table.querySelector('.junqi-history'), moves=history.querySelector('ol');
  const cells=puzzleGrid(table.querySelector('.junqi-board-host'),5,'军棋翻翻棋棋盘',choose,null,12);
  const grid=cells[0].parentElement;
  drawJunqiGrid(grid,cells);
  grid.insertAdjacentHTML('beforeend',`<svg class="junqi-trail" viewBox="0 0 5 ${12+JUNQI_GAP}" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="junqi-trail-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth=".23" markerHeight=".23" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10Z"/></marker></defs><polyline marker-end="url(#junqi-trail-arrow)"/></svg>`);
  const trail=grid.querySelector('.junqi-trail polyline');

  function showAction() {
    const actions=state.history??[];
    const action=mode==='ai'?(actions.findLast(item=>item.player===1)??actions.at(-1)):actions.at(-1);
    const message=action?`第 ${action.step} 手 · ${seat(action.player)} · ${actionText(action)}`:state.count?'等待下一手':'开局 · 翻一枚暗子';
    if(latest.textContent!==message) latest.textContent=message;
    const route=action?.route?.length>1?action.route.map(index=>[index%5+.5,row(index)+.5+(row(index)>=6?JUNQI_GAP:0)]):[];
    if(route.length) {
      const start=route[0], first=route[1], end=route.at(-1), before=route.at(-2);
      const trim=(point,near)=>point.map((value,axis)=>value+(near[axis]-value)*.29);
      route[0]=trim(start,first);
      route[route.length-1]=trim(end,before);
    }
    trail.setAttribute('points',route.map(point=>point.join(',')).join(' '));
    moves.replaceChildren(...actions.slice().reverse().map(item=>{
      const li=document.createElement('li');
      li.textContent=`第 ${item.step} 手 · ${seat(item.player)} · ${actionText(item)}`;
      return li;
    }));
    history.hidden=!actions.length;
    return action;
  }

  function openMatch(restart=false) {
    clearTimeout(timer);
    const previous=restart?null:load(key(),null);
    state=previous?.board?.length===60&&Array.isArray(previous.shown)&&Array.isArray(previous.colors)?previous:createFlipMatch();
    selected=-1;
    history.open=false;
    api.hideOverlay();
    frame();
  }
  function waiting() { return mode==='ai'&&state.side===1&&state.winner===null; }
  function playAction() {
    const action=state.history?.at(-1);
    if(action) api.play(action.target?'capture':action.from===undefined?'flip':'move');
  }
  function choose(index) {
    if(waiting()||state.winner!==null) return;
    const color=state.colors[state.side], piece=state.board[index];
    if(piece&&!state.shown.includes(index)) {
      if(revealFlip(state,index)) {selected=-1;playAction();frame();}
      return;
    }
    if(piece&&piece.side===color) {
      if(!mobile(piece)) {
        info.textContent=junqiPieceNames[piece.type]+'不能移动。';
        return;
      }
      selected=selected===index?-1:index;
      paint();
      return;
    }
    if(selected>=0) {
      if(playFlip(state,selected,index)) {selected=-1;playAction();frame();}
      else info.textContent=invalidMove(state.board[selected],piece,index,state.mines);
    }
  }
  function frame() {
    save(key(),state);
    paint();
    if(waiting()) timer=setTimeout(()=>{
      const option=flipComputer(state,difficulty);
      if(!option) state.winner=0;
      else {
        if(option.flip!==undefined) revealFlip(state,option.flip);
        else playFlip(state,option.from,option.to);
        playAction();
      }
      frame();
    },420);
    else if(state.winner!==null) {
      const title=state.winner===2?'和局':seat(state.winner)+'获胜';
      const action=state.history?.at(-1);
      const result=action?`共 ${state.count} 手 · ${seat(action.player)}${actionText(action)}`:`共 ${state.count} 手`;
      api.play('clear');
      api.overlay(title,result,[['再来一局',()=>openMatch(true)],['回看棋盘',api.hideOverlay]]);
    }
  }
  function paint() {
    const board=visibleBoard(state),color=state.colors[state.side];
    const action=showAction();
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
    info.textContent=state.winner!==null?'对局已结束':waiting()?'电脑正在思考…':selected>=0?
      coordinate(selected)+' '+junqiPieceNames[board[selected].type]+' · 选择亮起的落点':
      color===null?(last===null?'先翻任意暗子。自己连续两次翻到同色即可定阵营。':'上次你翻到'+colorName(last)+'。再翻到同色就能确定阵营。'):
      '每回合可翻一枚暗子，或走一枚己方明子。先清掉对方地雷，再夺旗。';
    cells.forEach((cell,index)=>{
      const piece=board[index];
      const lit=piece&&!piece.hidden;
      const label=piece?(lit?colorName(piece.side)+' '+junqiPieceNames[piece.type]:'未翻暗子'):junqiCamp(index)?'空行营':'空兵站';
      const mark=index===action?.from?'出发点':index===action?.to?(action.from===undefined?'刚翻开的棋':'落点'):'';
      cell.dataset.selected=String(index===selected);
      cell.dataset.legal=String(selected>=0&&Boolean(flipMove(board,selected,index,color,state.mines)));
      cell.dataset.piece=lit?String(piece.side):piece?'face-down':'';
      cell.dataset.trace=mark;
      cell.setAttribute('aria-label',`${coordinate(index)}，${label}${mark?'，'+mark:''}`);
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
