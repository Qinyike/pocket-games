const back = ['R','N','B','A','K','A','B','N','R'];
const red = {K:'帅',A:'仕',B:'相',N:'马',R:'车',C:'炮',P:'兵'};
const black = {K:'将',A:'士',B:'象',N:'马',R:'车',C:'炮',P:'卒'};
const palace = (x,y,side) => x>=3 && x<=5 && (side===0 ? y>=7 : y<=2);

export function xiangqiBoard() {
  const board = Array(90).fill(null);
  const place = (side,x,y,type) => { board[y*9+x]={side,type}; };
  for (const side of [0,1]) {
    back.forEach((type,x)=>place(side,x,side===0?9:0,type));
    for (const x of [1,7]) place(side,x,side===0?7:2,'C');
    for (const x of [0,2,4,6,8]) place(side,x,side===0?6:3,'P');
  }
  return board;
}

function pseudo(board,from,to) {
  const piece=board[from], rival=board[to];
  if (!piece || from===to || rival?.side===piece.side) return false;
  const {side,type}=piece;
  const x=from%9, y=Math.floor(from/9), u=to%9, v=Math.floor(to/9);
  const dx=u-x, dy=v-y, ax=Math.abs(dx), ay=Math.abs(dy);
  let between=0;
  if (dx===0 || dy===0) {
    const stride=Math.sign(dx)+9*Math.sign(dy);
    for (let cell=from+stride;cell!==to;cell+=stride) if (board[cell]) between+=1;
  }
  switch(type) {
    case 'K': return (rival?.type==='K' && dx===0 && between===0) || (ax+ay===1 && palace(u,v,side));
    case 'A': return ax===1 && ay===1 && palace(u,v,side);
    case 'B': return ax===2 && ay===2 && (side===0?v>=5:v<=4) && !board[(y+dy/2)*9+x+dx/2];
    case 'N': return (ax===2 && ay===1 && !board[from+Math.sign(dx)]) || (ax===1 && ay===2 && !board[from+9*Math.sign(dy)]);
    case 'R': return (dx===0 || dy===0) && between===0;
    case 'C': return (dx===0 || dy===0) && between===Number(Boolean(rival));
    case 'P': return (dx===0 && dy===(side===0?-1:1)) || (ay===0 && ax===1 && (side===0?y<=4:y>=5));
    default: return false;
  }
}

export function inCheck(board,side) {
  const general = board.findIndex(piece=>piece?.side===side && piece.type==='K');
  return general<0 || board.some((piece,index)=>piece && piece.side!==side && pseudo(board,index,general));
}

export function xiangqiMove(board,from,to) {
  if (!Number.isInteger(to)||to<0||to>=board.length) return null;
  if (!pseudo(board,from,to)) return null;
  const next=board.slice();
  next[to]=next[from];
  next[from]=null;
  return inCheck(next,next[to].side) ? null : next;
}

const value = {K:10000,R:92,C:46,N:43,B:21,A:21,P:11};

function legalMoves(board,side) {
  const moves=[];
  for(let from=0;from<board.length;from++) {
    if(board[from]?.side!==side) continue;
    for(let to=0;to<board.length;to++) {
      const next=xiangqiMove(board,from,to);
      if(next) moves.push({from,to,next});
    }
  }
  return moves;
}

function evaluate(board,side) {
  let score=0;
  for(const [index,piece] of board.entries()) {
    if(!piece) continue;
    const col=index%9,row=Math.floor(index/9);
    const advance=piece.side===0?9-row:row;
    const center=4-Math.abs(col-4);
    let position=0;
    if(piece.type==='P') position=advance*1.1+(advance>=5?8+center:0);
    if(piece.type==='R'||piece.type==='C'||piece.type==='N') position=center*1.15+Math.min(advance,6)*.6;
    score+=(piece.side===side?1:-1)*(value[piece.type]+position);
  }
  return score;
}

export function xiangqiComputer(board,side,recent=[]) {
  const rank = move=>evaluate(move.next,side)+(inCheck(move.next,1-side)?8:0);
  const ordered=legalMoves(board,side).map(move=>({...move,score:rank(move)})).sort((a,b)=>b.score-a.score);
  let best=null,bestScore=-Infinity;
  for(const move of ordered) {
    const replies=legalMoves(move.next,1-side);
    if(!replies.length) return [move.from,move.to];
    const returns=recent.filter(({side:owner,from,to})=>owner===side&&from===move.to&&to===move.from).length;
    const pressure=inCheck(move.next,1-side)?4:0;
    let worst=Infinity;
    for(const reply of replies) {
      const score=evaluate(reply.next,side)+pressure-returns*4-(inCheck(reply.next,side)?6:0);
      worst=Math.min(worst,score);
      if(worst<=bestScore) break;
    }
    if(worst>bestScore) {bestScore=worst;best=[move.from,move.to];}
  }
  return best;
}

function xiangqiDiagram() {
  let lines='';
  for(let row=0;row<10;row++) lines+=`M.5 ${row+.5}H8.5 `;
  for(let col=0;col<9;col++) {
    const line=col+.5;
    lines+=col===0||col===8?`M${line} .5V9.5 `:`M${line} .5V4.5 M${line} 5.5V9.5 `;
  }
  lines+='M3.5 .5L5.5 2.5 M5.5 .5L3.5 2.5 M3.5 7.5L5.5 9.5 M5.5 7.5L3.5 9.5';
  return `<path d="${lines}"/><text x="2.45" y="5" class="xiangqi-river">楚 河</text><text x="6.55" y="5" class="xiangqi-river">汉 界</text>`;
}

function positionKey(board,side) {
  return side+board.map(piece=>piece?piece.side===0?piece.type:piece.type.toLowerCase():'.').join('');
}

export function xiangqiAdjudicate(board,side,trail,reset=false) {
  const next=reset?[]:trail.slice();
  next.push({key:positionKey(board,side),check:inCheck(board,side)});
  const last=next.length-1;
  for(let period=2;period*3<=last;period+=2) {
    if(next[last-period].key!==next[last].key) continue;
    const start=last-3*period;
    if(!next.slice(start,last-period+1).every((entry,offset)=>entry.key===next[start+offset+period].key)) continue;
    const recent=next.slice(last-period+1);
    const checking=recent.filter((_,i)=>i%2===0).every(position=>position.check);
    const replying=recent.filter((_,i)=>i%2===1).every(position=>position.check);
    if(checking!==replying) return {trail:next,winner:checking?1-side:side,reason:'单方长将判负'};
    break;
  }
  return {trail:next,winner:last>=120?2:null,reason:last>=120?'连续 60 回合未吃子，判和':''};
}

export const xiangqi = {
  id:'xiangqi', label:'中国象棋棋盘', cols:9, rows:10, initial:xiangqiBoard, move:xiangqiMove, computer:xiangqiComputer,
  diagram:xiangqiDiagram, adjudicate:xiangqiAdjudicate,
  endReason:(board,side)=>inCheck(board,side)?'将死':'困毙',
  name:piece=>(piece.side===0?red:black)[piece.type],
  tile:(_, index)=>Math.floor(index/9)===4 ? 'river-bank' : '',
  status(board,side) { return inCheck(board,side) ? '将军。须先解将' : '选中棋子后点目标位置'; },
  winner(board,side) {
    const canMove = board.some((piece,from)=>piece?.side===side && board.some((_,to)=>xiangqiMove(board,from,to)));
    return canMove ? null : 1-side;
  },
};
