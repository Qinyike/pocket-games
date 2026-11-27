const pieces = { F:'军旗', M:'地雷', B:'炸弹', 9:'司令', 8:'军长', 7:'师长', 6:'旅长', 5:'团长', 4:'营长', 3:'连长', 2:'排长', 1:'工兵' };
const officers = ['9','8','7','7','6','6','5','5','4','4','3','3','3','2','2','2','1','1','1'];
const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
const x = index=>index%5;
const y = index=>Math.floor(index/5);
const onBoard = (col,row)=>col>=0 && col<5 && row>=0 && row<12;
const camp = index=>[6,8,12,16,18].includes(Math.min(index,59-index));
const base = index=>(y(index)===0 || y(index)===11) && (x(index)===1 || x(index)===3);
const rail = index=>([1,5,6,10].includes(y(index))) || ([0,4].includes(x(index)) && y(index)>0 && y(index)<11);
const bridge = (a,b)=>Math.min(y(a),y(b))===5 && Math.max(y(a),y(b))===6;
const bridgePass = (a,b)=>x(a)===x(b) && x(a)%2===0;

function shuffle(items,random) {
  for (let i=items.length-1;i>0;i-=1) {
    const j=Math.floor(random()*(i+1));
    [items[i],items[j]]=[items[j],items[i]];
  }
  return items;
}

export function junqiBoard(random = Math.random) {
  const board=Array(60).fill(null);
  for (const side of [0,1]) {
    const map = index=>side===1?index:59-index;
    const slots=Array.from({length:30},(_,i)=>i).filter(i=>!camp(i));
    const assign=(index,type)=>{
      board[map(index)]={side,type};
      slots.splice(slots.indexOf(index),1);
    };
    assign(random()<.5?1:3,'F');
    for (const index of shuffle(slots.filter(i=>i<10),random).slice(0,3)) assign(index,'M');
    for (const index of shuffle(slots.filter(i=>i<25),random).slice(0,2)) assign(index,'B');
    shuffle([...officers],random).forEach((type,index)=>assign(slots[0],type));
  }
  return board;
}

function railLink(a,b) {
  if (!rail(a) || !rail(b)) return false;
  if (bridge(a,b)) return bridgePass(a,b);
  return y(a)===y(b) ? [1,5,6,10].includes(y(a)) : [0,4].includes(x(a));
}

function railPath(board,from,to,engineer) {
  if (!rail(from) || !rail(to)) return false;
  if (!engineer && x(from)!==x(to) && y(from)!==y(to)) return false;
  const visited=new Set([from]);
  const queue=[from];
  while (queue.length) {
    const cell=queue.pop();
    for (const [dx,dy] of offsets) {
      const col=x(cell)+dx,row=y(cell)+dy;
      if (!onBoard(col,row)) continue;
      if (!engineer && (x(from)===x(to) ? dx : dy)) continue;
      const next=row*5+col;
      if (visited.has(next) || !railLink(cell,next)) continue;
      if (next===to) return true;
      if (board[next]) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

export function junqiMove(board,from,to) {
  const unit=board[from], target=board[to];
  if (!unit || from===to || unit.side===target?.side || ['M','F'].includes(unit.type) || base(from) || (camp(to) && target)) return null;
  const dx=Math.abs(x(from)-x(to)),dy=Math.abs(y(from)-y(to));
  const road=bridge(from,to) ? bridgePass(from,to) : dx+dy===1 || (dx===1 && dy===1 && (camp(from)||camp(to)));
  if (!road && !railPath(board,from,to,unit.type==='1')) return null;
  const next=board.slice();
  const both=target && target.type!=='F' && ([unit.type,target.type].includes('B') || unit.type===target.type);
  const win=!target || target.type==='F' || (target.type==='M' ? unit.type==='1' : Number(unit.type)>Number(target.type));
  next[from]=null;
  next[to]=both?null:win?unit:target;
  return next;
}

export const junqi = {
  id:'junqi', label:'军棋棋盘', cols:5, rows:12, initial:junqiBoard, move:junqiMove,
  secret:true, name:piece=>pieces[piece.type],
  tile:(_,index)=>camp(index)?'camp':base(index)?'base':rail(index)?'rail':'',
  status:()=> '选择己方棋子，再选择目标。行营内的棋子受到保护',
  winner(board,side) {
    const flag=board.some(piece=>piece?.side===side && piece.type==='F');
    const mobile=flag && board.some((piece,from)=>piece?.side===side && board.some((_,to)=>junqiMove(board,from,to)));
    return mobile?null:1-side;
  },
};
