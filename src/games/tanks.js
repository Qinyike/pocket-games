import { arrows, clamp, directions, load, loop, save } from '../engine.js';
import { rect, tankSprite } from '../art.js';

const STAGES = [
  { name:'前哨', total:5, walls:[
    '..................',
    '...bb.......bb....',
    '..................',
    '......ss..ss......',
    '..bb..........bb..',
    '.....b......b.....',
    '.....b......b.....',
    '..................',
    '.......bbbb.......',
    '..................',
  ] },
  { name:'峡口', total:7, walls:[
    '..................',
    '....s........s....',
    '..bbb........bbb..',
    '.......bbbb.......',
    '....s........s....',
    '....s...bb...s....',
    '..................',
    '...bbb......bbb...',
    '........bb........',
    '..................',
  ] },
  { name:'核心站', total:9, walls:[
    '..................',
    '.....b......b.....',
    '.....b..ss..b.....',
    '..ss..........ss..',
    '......bb..bb......',
    '..bb..........bb..',
    '......ss..ss......',
    '..................',
    '......b....b......',
    '..................',
  ] },
];
const UNIT=20, WIDTH=360, HEIGHT=200;
const VECTORS=Object.values(directions);

function touches(x,y,r,wx,wy) {
  return x+r>wx && x-r<wx+UNIT && y+r>wy && y-r<wy+UNIT;
}

export function mountTanks(api) {
  const ctx=api.canvas(WIDTH,HEIGHT,'钢甲防线战场').getContext('2d');
  let index=0, stage, mode, walls, bullets, drones, player, score, integrity, stock, left, spawnTime, effects, time;
  let record=load('tanks',0);
  const base={ x:180, y:188, radius:8 };
  const controller=api.controls({...arrows,Space:'fire',KeyJ:'fire',KeyP:'pause',Escape:'pause'},[
    ['left','←',false,'左移'],['up','↑',false,'上移'],['down','↓',false,'下移'],['right','→',false,'右移'],['fire','开火',true],['pause','暂停'],
  ], action => {
    if (action==='fire') shoot(player,false);
    if (action==='pause') pause();
  }, () => mode==='play');
  const selectLevel=api.select('选择关卡',STAGES.map((_,i) => [i,'第 '+(i+1)+' 关']),value => start(Number(value)));
  function start(next=0, points=0) {
    index=next; selectLevel(index); stage=STAGES[index]; mode='play'; score=points;
    integrity=3; stock=3; left=stage.total; spawnTime=.45; time=0;
    walls=stage.walls.flatMap((row,y) => [...row].map((type,x) => ({type,x:x*UNIT,y:y*UNIT,hp:2}))).filter(wall => wall.type!=='.');
    bullets=[]; drones=[]; effects=[];
    newPlayer();
    controller.clear(); api.hideOverlay(); api.message(stage.name+' · 守住充能核心');
    hud();
  }
  function newPlayer() { player={ x:132,y:186,dx:0,dy:-1,cooldown:0,shield:1.4 }; }
  function hud() { api.hud(['关卡',index+1+'/'+STAGES.length],['待击退',left+drones.length],['护甲',stock],['核心',integrity],['得分',score],['纪录',record]); }
  function pause() {
    if (mode!=='play') return;
    mode='paused';
    api.overlay('已暂停',stage.name,[['继续',() => { mode='play'; api.hideOverlay(); }]]);
  }
  function end(win) {
    mode='end';
    if (score>record) { record=score; save('tanks',record); }
    hud();
    api.play(win ? 'clear' : 'fail');
    const next=win && index<STAGES.length-1;
    api.overlay(win?(next?'防线守住了':'全部防线守住了'):'防线失守',`得分 ${score} · 纪录 ${record}`,[
      next ? ['下一关',() => start(index+1,score)] : ['重新挑战',() => start()],
      ['重玩本关',() => start(index)],
    ]);
  }
  function shoot(unit, enemy) {
    if (unit.cooldown>0) return;
    unit.cooldown=enemy?1.35+Math.random()*.80:.24;
    bullets.push({ x:unit.x+unit.dx*11,y:unit.y+unit.dy*11,dx:unit.dx,dy:unit.dy,enemy });
    if (!enemy) api.play('fire');
  }
  function move(unit, dx, dy, distance) {
    const x=clamp(unit.x+dx*distance,9,WIDTH-9), y=clamp(unit.y+dy*distance,9,HEIGHT-9);
    unit.dx=dx; unit.dy=dy;
    if (walls.some(wall => touches(x,y,8,wall.x,wall.y))) return false;
    if (Math.hypot(x-base.x,y-base.y)<17) return false;
    if ([player,...drones].some(other => other!==unit && Math.abs(x-other.x)<16 && Math.abs(y-other.y)<16)) return false;
    if (x===unit.x && y===unit.y) return false;
    unit.x=x; unit.y=y;
    return true;
  }
  function spawn(dt) {
    if (!left || drones.length>=3) return;
    spawnTime-=dt;
    if (spawnTime>0) return;
    const preferred=[40,180,320][(stage.total-left)%3];
    const x=[preferred,40,180,320].find(candidate => [player,...drones].every(unit => Math.hypot(candidate-unit.x,13-unit.y)>33));
    if (x===undefined) return;
    drones.push({ x,y:13,dx:0,dy:1,cooldown:.7,change:.45 });
    left-=1; spawnTime=1.05;
  }
  function collide(bullet) {
    if (bullet.x<0 || bullet.y<0 || bullet.x>=WIDTH || bullet.y>=HEIGHT) return true;
    const wall=walls.find(wall => touches(bullet.x,bullet.y,1.5,wall.x,wall.y));
    if (wall) {
      if (wall.type==='b' && --wall.hp===0) walls=walls.filter(item => item!==wall);
      if (!bullet.enemy) api.play(wall.type === 'b' ? 'brick' : 'armor');
      effects.push({x:bullet.x,y:bullet.y,life:.19});
      return true;
    }
    const hit=unit => Math.abs(bullet.x-unit.x)<9 && Math.abs(bullet.y-unit.y)<9;
    if (hit(base)) {
      if (bullet.enemy) { integrity=Math.max(0,integrity-1); hud(); api.play('damage'); }
      return true;
    }
    if (bullet.enemy && hit(player)) {
      if (player.shield<=0) { stock-=1; effects.push({ ...player,life:.28 }); newPlayer(); hud(); api.play('damage'); }
      return true;
    }
    if (!bullet.enemy) {
      const drone=drones.find(hit);
      if (drone) {
        effects.push({ ...drone,life:.28 });
        drones=drones.filter(item => item!==drone);
        score+=100; hud(); api.play('blast');
        return true;
      }
    }
    return false;
  }
  function update(dt) {
    if (mode!=='play') return;
    time+=dt;
    player.cooldown-=dt;
    player.shield-=dt;
    const direction=Object.keys(directions).find(key => controller.held(key));
    if (direction) move(player,...directions[direction],85*dt);
    if (controller.held('fire')) shoot(player,false);
    spawn(dt);
    for (const drone of drones) {
      drone.cooldown-=dt;
      drone.change-=dt;
      if (drone.change<=0) {
        const towards=base.x-drone.x;
        const preferred=Math.abs(towards)>14 ? [Math.sign(towards),0] : [0,1];
        const [dx,dy]=Math.random()<.52 ? preferred : VECTORS[Math.floor(Math.random()*4)];
        drone.dx=dx; drone.dy=dy; drone.change=.3+Math.random()*.6;
      }
      if (!move(drone,drone.dx,drone.dy,(30+index*5)*dt)) drone.change=Math.min(.05,drone.change);
      shoot(drone,true);
    }
    bullets=bullets.filter(bullet => {
      const speed=bullet.enemy?116:194;
      bullet.x+=bullet.dx*dt*speed; bullet.y+=bullet.dy*dt*speed;
      return !collide(bullet);
    });
    effects=effects.filter(effect => (effect.life-=dt)>0);
    if (stock===0 || integrity===0) end(false);
    else if (!left && !drones.length) end(true);
  }
  function draw() {
    rect(ctx,'#2b3638',0,0,WIDTH,HEIGHT);
    for (let x=0;x<WIDTH;x+=UNIT) for (let y=0;y<HEIGHT;y+=UNIT) {
      rect(ctx,'#ffffff0a',x,y,UNIT-1,UNIT-1);
      rect(ctx,'#ffffff15',x+8,y+8,2,1);
    }
    for (const {type,x,y,hp} of walls) {
      rect(ctx,type==='b'?'#89654f':'#5e7885',x,y,UNIT,UNIT);
      rect(ctx,type==='b'?'#b18565':'#90a9a9',x,y,UNIT,2);
      rect(ctx,'#00000050',x,y+10,UNIT,1);
      if (type==='s') for (const corner of [[3,3],[15,3],[3,15],[15,15]]) rect(ctx,'#d2d9c4',x+corner[0],y+corner[1],2,2);
      if (hp===1) { rect(ctx,'#36272a',x+8,y+3,2,10); rect(ctx,'#36272a',x+10,y+12,7,2); }
    }
    rect(ctx,'#172431',base.x-10,base.y-9,20,18);
    rect(ctx,integrity>1?'#9ee4ca':'#f4a17e',base.x-6,base.y-6,12,12);
    rect(ctx,'#f5ffce',base.x-2,base.y-3,4,6);
    if (player.shield<=0 || Math.floor(time*13)%2===0) tankSprite(ctx,player.x,player.y,Math.atan2(player.dy,player.dx),'#c5f081');
    for (const unit of drones) tankSprite(ctx,unit.x,unit.y,Math.atan2(unit.dy,unit.dx),'#ed8e78');
    for (const bullet of bullets) rect(ctx,bullet.enemy?'#ff987f':'#f9e89e',bullet.x-2,bullet.y-2,4,4);
    for (const {x,y,life} of effects) {
      const radius=9-life*20;
      rect(ctx,'#ffc881',x-radius,y-1,radius*2,2); rect(ctx,'#ff986d',x-1,y-radius,2,radius*2);
    }
  }
  api.restart(() => start(index));
  document.addEventListener('visibilitychange',() => { if(document.hidden) pause(); },{signal:api.signal});
  start();
  loop(api.signal,update,draw);
}
