import { clamp, overlaps, loop, load, save } from '../engine.js';
import { landscape, rect, rover } from '../art.js';

export const TRAILS = [
  { name:'风谷', ground:[[0,158],[193,344],[382,559],[600,794],[836,1040]], ledges:[[108,122,45],[260,123,50],[469,120,52],[668,103,54],[885,121,45]], drones:[242,518,733,967], flag:628 },
  { name:'暮色矿坑', ground:[[0,125],[179,315],[378,549],[598,756],[823,1050]], ledges:[[110,125,44],[256,110,48],[326,131,41],[465,105,44],[707,118,46],[767,134,42],[904,103,55]], drones:[224,414,485,659,886,979], flag:632 },
  { name:'霜脊', ground:[[0,119],[181,293],[362,499],[562,714],[782,1040]], ledges:[[101,124,49],[224,102,41],[306,128,46],[405,101,43],[509,125,47],[626,97,45],[723,128,49],[840,109,53],[929,96,42]], drones:[233,420,460,602,674,847,940], flag:582 },
];

export function mountTrail(api) {
  const width = 360, height = 202;
  const canvas = api.canvas(width,height,'风谷探险场景');
  const ctx = canvas.getContext('2d');
  let index = 0, collected, removed, level, solids, gems, drones, player, checkpoint, death, deaths, camera, mode, elapsed, coyote, buffer;
  let records = load('trail', {});
  const controls = api.controls({ ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',KeyP:'pause',Escape:'pause' }, [
    ['left','←',false,'左移'],['right','→',false,'右移'],['jump','跳跃',true],['pause','暂停'],
  ], action => {
    if (action === 'jump') buffer = .13;
    if (action === 'pause') pause();
  }, () => mode === 'play');

  const selectLevel = api.select('选择关卡', TRAILS.map((_,i) => [i,'第 '+(i+1)+' 关']), value => start(Number(value)));

  function score() {
    api.hud(['关卡', (index+1) + ' / ' + TRAILS.length], ['碎片', collected.size + ' / ' + gems.length], ['失足', deaths]);
  }
  function spawn(x) {
    player = { x,y:142,w:13,h:18,vx:0,vy:0,direction:1,grounded:false };
    camera = clamp(x - 110, 0, level.ground.at(-1)[1]-width);
    coyote = buffer = 0;
  }
  function start(next) {
    index = next;
    selectLevel(index);
    level = TRAILS[index];
    solids = [...level.ground.map(([a,b]) => ({x:a,y:162,w:b-a,h:50})), ...level.ledges.map(([x,y,w]) => ({x,y,w,h:9,oneWay:true}))];
    gems = solids.slice(level.ground.length).flatMap(({x,y,w}) => [x+9,x+w-14].map(xx => ({x:xx,y:y-13,w:5,h:8})));
    drones = level.drones.map(x => ({x,y:150,w:13,h:12}));
    collected = new Set();
    removed = new Set();
    checkpoint = null;
    death = 0;
    deaths = 0;
    elapsed = 0;
    mode = 'play';
    controls.clear();
    spawn(22);
    api.hideOverlay();
    api.message(level.name + ' · 抵达出口');
    score();
  }
  function pause() {
    if (mode !== 'play') return;
    mode = 'pause';
    api.overlay('已暂停', level.name, [['继续', () => { mode = 'play'; api.hideOverlay(); }]]);
  }
  function lose() {
    if (death) return;
    death = .55;
    deaths += 1;
    controls.clear();
    api.play(175);
    api.message(checkpoint ? '即将从信标处返回' : '即将从起点返回');
    score();
  }
  function win() {
    mode = 'end';
    const time = Math.round(elapsed * 10) / 10;
    if (!records[index] || time < records[index]) {
      records = { ...records, [index]:time };
      save('trail', records);
    }
    api.play(835);
    api.overlay(index === TRAILS.length - 1 ? '探险完成' : '抵达出口', `${time} 秒 · 碎片 ${collected.size}/${gems.length} · 最快 ${records[index]} 秒`, [
      index < TRAILS.length-1 ? ['下一关', () => start(index+1)] : ['从头挑战', () => start(0)],
      ['重玩本关', () => start(index)],
    ]);
  }
  function update(dt) {
    if (mode !== 'play') return;
    elapsed += dt;
    if (death) {
      death -= dt;
      if (death <= 0) { death = 0; spawn(checkpoint ?? 22); api.message(level.name + ' · 抵达出口'); }
      return;
    }
    const axis = Number(controls.held('right')) - Number(controls.held('left'));
    if (axis) player.direction = axis;
    player.vx += (axis * 127 - player.vx) * Math.min(1,dt*(axis ? 16 : 22));
    player.x = clamp(player.x + player.vx*dt, 0, level.ground.at(-1)[1]-player.w);
    for (const block of solids) {
      if (block.oneWay || !overlaps(player, block)) continue;
      if (player.vx > 0) player.x = block.x-player.w;
      if (player.vx < 0) player.x = block.x+block.w;
    }
    if (player.grounded) coyote = .085;
    else coyote = Math.max(0,coyote-dt);
    if (buffer > 0 && coyote > 0) {
      player.vy = -310; player.grounded = false; coyote = buffer = 0; api.play(430);
    }
    buffer = Math.max(0, buffer-dt);
    const oldBottom = player.y + player.h;
    player.vy = Math.min(390, player.vy + 700*dt);
    player.y += player.vy*dt;
    player.grounded = false;
    for (const block of solids) {
      if (!overlaps(player, block)) continue;
      if (block.oneWay && (player.vy <= 0 || oldBottom > block.y + .01)) continue;
      if (player.vy > 0) { player.y = block.y-player.h; player.grounded = true; }
      else player.y = block.y+block.h;
      player.vy = 0;
    }
    gems.forEach((gem,id) => {
      if (!collected.has(id) && overlaps(player,gem)) { collected.add(id); api.play(720); score(); }
    });
    for (const [id, drone] of drones.entries()) {
      const target = { ...drone, x:drone.x + Math.sin(elapsed*2 + id)*8 };
      if (removed.has(id) || !overlaps(player,target)) continue;
      if (oldBottom <= target.y+4) {
        removed.add(id); player.vy=-190; player.grounded=false; api.play(550);
      } else { lose(); return; }
    }
    if (player.y > 220) { lose(); return; }
    if (!checkpoint && player.x >= level.flag && player.x <= level.flag+28 && player.grounded) {
      checkpoint=level.flag; api.play(660); api.message('信标已激活');
    }
    if (player.x > level.ground.at(-1)[1]-49 && player.y > 110) win();
    const target = clamp(player.x-125, 0, level.ground.at(-1)[1]-width);
    camera += (target-camera)*Math.min(1,dt*8);
  }
  function draw() {
    landscape(ctx,width,height,camera,index);
    ctx.save();
    ctx.translate(-Math.round(camera),0);
    for (const block of solids) {
      if (block.x + block.w < camera || block.x > camera+width) continue;
      rect(ctx,'#233e3f',block.x,block.y,block.w,block.h);
      rect(ctx,'#92b97d',block.x,block.y,block.w,3);
      for (let x=block.x+5;x<block.x+block.w-6;x+=13) rect(ctx,'#467257',x,block.y+5,5,2);
    }
    gems.forEach(({x,y},id) => {
      if (collected.has(id)) return;
      rect(ctx,'#f5ba61',x,y,5,8); rect(ctx,'#fff4b2',x+1,y+1,2,3);
    });
    drones.forEach((drone,id) => {
      if (removed.has(id)) return;
      const x=drone.x+Math.sin(elapsed*2+id)*8;
      rect(ctx,'#a85568',x,153,13,8); rect(ctx,'#e99a88',x+2,150,9,6); rect(ctx,'#451f3d',x+8,152,2,3);
    });
    rect(ctx,'#f1d0a3',level.flag,130,2,32);
    rect(ctx,checkpoint?'#d4fa82':'#c58487',level.flag+2,130,11,9);
    const portal=level.ground.at(-1)[1]-36;
    rect(ctx,'#c0ed9d',portal,127,20,35);
    rect(ctx,'#36565b',portal+3,132,14,30);
    rect(ctx,'#78af94',portal+8,138,4,17);
    if (!death) rover(ctx,player.x+6,player.y+18,1,player.direction,Math.abs(player.vx)>20&&player.grounded&&Math.floor(elapsed*13)%2 ? 2 : 0);
    ctx.restore();
  }
  api.restart(() => start(index));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, { signal:api.signal });
  start(0);
  loop(api.signal,update,draw);
}
