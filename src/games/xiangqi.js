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
  if (!pseudo(board,from,to)) return null;
  const next=board.slice();
  next[to]=next[from];
  next[from]=null;
  return inCheck(next,next[to].side) ? null : next;
}

export const xiangqi = {
  id:'xiangqi', label:'中国象棋棋盘', cols:9, rows:10, initial:xiangqiBoard, move:xiangqiMove,
  name:piece=>(piece.side===0?red:black)[piece.type],
  tile:(_, index)=>Math.floor(index/9)===4 ? 'river-bank' : '',
  status(board,side) { return inCheck(board,side) ? '将军。须先解将' : '选中棋子后点目标位置'; },
  winner(board,side) {
    const canMove = board.some((piece,from)=>piece?.side===side && board.some((_,to)=>xiangqiMove(board,from,to)));
    return canMove ? null : 1-side;
  },
};
