import { arrows, directions, load, loop, save } from '../engine.js';
import { rect, rover } from '../art.js';

export const WAREHOUSES = [
  ['########','#      #','# .    #','# $@   #','#      #','########'],
  ['########','#   .  #','#  $$  #','#  .@  #','#      #','########'],
  ['########','# . .  #','# $$#  #','#  @   #','#      #','########'],
  ['########','# .    #','#  ##  #','# $ $ .#','# @    #','########'],
  ['#########','# .  .  #','# # #   #','# $ $$  #','#    @. #','#       #','#########'],
  ['#########','# . . . #','#  ###  #','# $   $ #','#   $   #','#  @    #','#########'],
  ['#########','#  . .  #','# # # # #','#    $  #','# $ $#  #','#  @ .  #','#########'],
  ['#########','# . . . #','# #  #  #','# $ $ $ #','#   #   #','#  @    #','#########'],
];

export function warehouse(rows) {
  const width=rows[0].length, height=rows.length, wall=new Set(), target=new Set(), boxes=new Set();
  let player;
  rows.forEach((row,y) => [...row].forEach((symbol,x) => {
    const id=y*width+x;
    if (symbol==='#') wall.add(id);
    if (symbol==='.' || symbol==='*') target.add(id);
    if (symbol==='$' || symbol==='*') boxes.add(id);
    if (symbol==='@') player=id;
  }));
  return { width,height,wall,target,boxes,player,moves:0,pushes:0 };
}

export function pushMove(level, dx, dy) {
  const { width, player, wall, boxes } = level;
  const x=player%width+dx, y=Math.floor(player/width)+dy;
  if (x<0 || x>=width || y<0 || y>=level.height) return level;
  const next=y*width+x;
  if (wall.has(next)) return level;
  if (!boxes.has(next)) return { ...level,player:next,moves:level.moves+1 };
  const tx=x+dx, ty=y+dy, to=ty*width+tx;
  if (tx<0 || tx>=width || ty<0 || ty>=level.height || wall.has(to) || boxes.has(to)) return level;
  const moved=new Set(boxes);
  moved.delete(next);
  moved.add(to);
  return { ...level,player:next,boxes:moved,moves:level.moves+1,pushes:level.pushes+1 };
}

export const solved = level => [...level.boxes].every(box => level.target.has(box));

export function mountCrates(api) {
  const canvas=api.canvas(288,224,'推箱棋盘');
  const ctx=canvas.getContext('2d'), unit=32;
  let index=0, board, history, repeat, ended, direction, undoButton;
  let best=load('crates',{});
  const controls=api.controls({ ...arrows,KeyZ:'undo' }, [
    ['left','←',false,'左移'],['up','↑',false,'上移'],['down','↓',false,'下移'],['right','→',false,'右移'],['undo','撤销'],
  ], act, () => !ended);
  undoButton=api.stage.parentElement.querySelector('[data-action=undo]');

  const setLevel=api.select('选择关卡',WAREHOUSES.map((_,i) => [i,'第 '+(i+1)+' 关']),value => start(Number(value)));
  function start(next) {
    index=next; board=warehouse(WAREHOUSES[next]); history=[]; repeat=null; ended=false; direction=1;
    controls.clear(); api.hideOverlay();
    canvas.width=board.width*unit; canvas.height=board.height*unit;
    api.stage.style.setProperty('--arena-ratio', board.width / board.height);
    setLevel(index);
    updateDisplay();
  }
  function updateDisplay() {
    api.hud(['关卡',index+1+'/'+WAREHOUSES.length],['步数',board.moves],['推箱',board.pushes],['最佳',best[index]??'—']);
    undoButton.disabled=history.length===0;
    api.message('目标格 ' + [...board.boxes].filter(box => board.target.has(box)).length + ' / ' + board.target.size);
    draw();
  }
  function act(action) {
    if (action==='undo') {
      if (history.length) { board=history.pop(); api.play('undo'); }
      repeat=null;
      updateDisplay();
      return;
    }
    repeat={action,time:.25};
    move(action);
  }
  function move(action) {
    const next=pushMove(board,...directions[action]);
    if (next===board) return;
    if (action==='left' || action==='right') direction=action==='left'?-1:1;
    history.push(board);
    if (next.pushes > board.pushes) {
      const [goal] = [...next.boxes].filter(box => !board.boxes.has(box));
      api.play(board.target.has(goal) ? 'target' : 'push');
    } else api.play('step');
    board=next; updateDisplay();
    if (!solved(board)) return;
    ended=true; repeat=null;
    best={ ...best,[index]:Math.min(best[index]??Infinity,board.moves) };
    save('crates',best); updateDisplay(); api.play('clear');
    api.overlay('调度完成', `${board.moves} 步 · 推箱 ${board.pushes} 次`, [
      index<WAREHOUSES.length-1 ? ['下一关',() => start(index+1)] : ['回到第 1 关',() => start(0)],
      ['重玩',() => start(index)],
    ]);
  }
  function draw() {
    for (let y=0;y<board.height;y+=1) for (let x=0;x<board.width;x+=1) {
      const id=y*board.width+x, xx=x*unit, yy=y*unit;
      const wall=board.wall.has(id);
      rect(ctx,wall?'#4b365c':(x+y)%2?'#252236':'#2c2940',xx,yy,unit-1,unit-1);
      if (wall) rect(ctx,'#644772',xx+2,yy+2,unit-5,3);
      if (board.target.has(id)) {
        rect(ctx,'#795878',xx+9,yy+9,14,14);
        rect(ctx,'#f3ae9c',xx+13,yy+13,6,6);
      }
      if (board.boxes.has(id)) {
        const ready=board.target.has(id);
        rect(ctx,'#1a1426',xx+5,yy+7,24,24);
        rect(ctx,ready?'#91c992':'#ce855d',xx+4,yy+4,24,24);
        rect(ctx,ready?'#cbed9a':'#ffd294',xx+4,yy+4,24,3);
        rect(ctx,ready?'#629576':'#965050',xx+9,yy+11,14,11);
        rect(ctx,ready?'#e0f6aa':'#efa47c',xx+13,yy+14,6,4);
      }
      if (id===board.player) rover(ctx,xx+16,yy+26,1.2,direction);
    }
  }
  let gesture;
  canvas.addEventListener('pointerdown',event => {
    if (ended || gesture || event.button!==0) return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  },{signal:api.signal});
  canvas.addEventListener('pointerup',event => {
    if (event.pointerId!==gesture?.id) return;
    const dx=event.clientX-gesture.x, dy=event.clientY-gesture.y;
    gesture=null;
    if (ended || Math.max(Math.abs(dx),Math.abs(dy))<16) return;
    act(Math.abs(dx)>=Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down'));
  },{signal:api.signal});
  canvas.addEventListener('lostpointercapture',() => {gesture=null;},{signal:api.signal});
  api.restart(() => start(index));
  start(0);
  loop(api.signal,dt => {
    if (ended || !repeat || !controls.held(repeat.action)) return;
    repeat.time-=dt;
    if (repeat.time <= 0) { repeat.time=.115; move(repeat.action); }
  },() => {});
}
