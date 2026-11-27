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

function canMove(board,from,to) {
  if(!Number.isInteger(to)||to<0||to>=board.length) return false;
  const unit=board[from], target=board[to];
  if (!unit || from===to || unit.side===target?.side || ['M','F'].includes(unit.type) || base(from) || (camp(to) && target)) return false;
  const dx=Math.abs(x(from)-x(to)),dy=Math.abs(y(from)-y(to));
  const road=bridge(from,to) ? bridgePass(from,to) : dx+dy===1 || (dx===1 && dy===1 && (camp(from)||camp(to)));
  return road || railPath(board,from,to,unit.type==='1');
}

function battle(attacker,defender) {
  if(!defender) return 1;
  if(attacker==='B'||defender==='B'||attacker===defender) return 0;
  if(defender==='F') return 1;
  if(defender==='M') return attacker==='1'?1:-1;
  return Number(attacker)>Number(defender)?1:-1;
}

export function junqiMove(board,from,to) {
  if(!canMove(board,from,to)) return null;
  const unit=board[from],target=board[to];
  const outcome=battle(unit.type,target?.type);
  const next=board.slice();
  const both=target && target.type!=='F' && ([unit.type,target.type].includes('B') || unit.type===target.type);
  const win=!target || target.type==='F' || (target.type==='M' ? unit.type==='1' : Number(unit.type)>Number(target.type));
  next[from]=null;
  next[to]=outcome===0?null:outcome>0?unit:target;
  return next;
}

const pieceValue = rank=>rank==='B'?7:rank==='M'?5:rank==='F'?35:3+Number(rank)/1.5;

function flagVisible(board,index) {
  const piece=board[index];
  return piece?.type==='F'&&!board.some(item=>item?.side===piece.side&&item.type==='9');
}

export function junqiComputer(board,side,recent=[],exposed=[]) {
  // Only public ranks and the computer's own pieces enter the position evaluation.
  const visible=board.map((piece,index)=>piece && (piece.side===side||exposed.includes(index)||flagVisible(board,index)?piece:{side:piece.side}));

  const moved=new Set(recent.filter(move=>move.side!==side && move.survived).map(move=>move.to));
  const enemyFlagRow=side===0?0:11;
  const distanceFromEnemy=(index)=>Math.abs(y(index)-enemyFlagRow);
  let best=null,bestScore=-Infinity;
  for(const [from,unit] of visible.entries()) {
    if(unit?.side!==side || base(from) || ['F','M'].includes(unit.type)) continue;
    for(let to=0;to<visible.length;to++) {
      if(!canMove(visible,from,to)) continue;
      const target=visible[to];
      const progress=distanceFromEnemy(from)-distanceFromEnemy(to);
      const visits=recent.filter(move=>move.side===side&&move.to===to).length;
      let score=progress*1.25+(camp(to) ? .6 : 0)-visits*1.65;
      if(target) {
        const pool=target.type?[target.type]:[...officers,'B','B'];
        if(!target.type&&!moved.has(to)) {
          if(distanceFromEnemy(to)<=1) pool.push('M','M','M');
          if(base(to)) pool.push('F','F','F','F','F','F');
        }
        let expected=0;
        for(const defender of pool) {
          const result=battle(unit.type,defender);
          if(result>=0) expected+=pieceValue(defender);
          if(result<=0) expected-=pieceValue(unit.type);
        }
        score+=3+expected/pool.length;
      }
      if(score>bestScore) {bestScore=score;best=[from,to];}
    }
  }
  return best;
}

function mayDeploy(index,side,type) {
  const row=side===1?y(index):11-y(index);
  if(row>=6||camp(index)) return false;
  if(type==='F') return base(index);
  if(type==='M') return row<=1;
  return type!=='B'||row<5;
}

export function swapDeployment(board,side,from,to) {
  const a=board[from],b=board[to];
  if(a?.side!==side||b?.side!==side||from===to||!mayDeploy(to,side,a.type)||!mayDeploy(from,side,b.type)) return null;
  const next=board.slice();
  [next[from],next[to]]=[b,a];
  return next;
}

function junqiDiagram() {
  let roads='',rails='',stations='';
  const path=(a,b)=>`M${x(a)+.5} ${y(a)+.5}L${x(b)+.5} ${y(b)+.5} `;
  for(let index=0;index<60;index++) {
    const cx=x(index)+.5,cy=y(index)+.5;
    if(camp(index)) stations+=`<circle cx="${cx}" cy="${cy}" r=".25" class="junqi-camp"/>`;
    else if(base(index)) stations+=`<rect x="${cx-.25}" y="${cy-.20}" width=".50" height=".40" rx=".04" class="junqi-base"/>`;
    else stations+=`<circle cx="${cx}" cy="${cy}" r=".075"/>`;
    for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]) {
      const col=x(index)+dx,row=y(index)+dy;
      if(!onBoard(col,row)) continue;
      const next=row*5+col;
      if(bridge(index,next)&&!bridgePass(index,next)) continue;
      if(dx&&dy&&!camp(index)&&!camp(next)) continue;
      if(!(dx&&dy)&&railLink(index,next)) rails+=path(index,next);
      else roads+=path(index,next);
    }
  }
  return `<path d="${roads}"/><path d="${rails}" class="junqi-rail-bed"/><path d="${rails}" class="junqi-rail-ties"/>${stations}`;
}

export const junqi = {
  id:'junqi', label:'军棋棋盘', cols:5, rows:12, initial:junqiBoard, move:junqiMove, computer:junqiComputer,
  secret:true, diagram:junqiDiagram, rearrange:swapDeployment, publicRank:flagVisible, name:piece=>pieces[piece.type],
  tile:(_,index)=>camp(index)?'camp':base(index)?'base':rail(index)?'rail':'',
  endReason:(board,side)=>board.some(piece=>piece?.side===side&&piece.type==='F')?'对方无棋可走':'夺旗',
  status:()=> '选择己方棋子，再选择目标。行营内的棋子受到保护',
  winner(board,side) {
    const flag=board.some(piece=>piece?.side===side && piece.type==='F');
    const mobile=flag && board.some((piece,from)=>piece?.side===side && board.some((_,to)=>canMove(board,from,to)));
    return mobile?null:1-side;
  },
};
