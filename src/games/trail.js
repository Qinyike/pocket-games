import { clamp, overlaps, loop, load, save } from '../engine.js';
import { landscape, rect, rover } from '../art.js';

import { TRAILS } from './trail-levels.js';
export { TRAILS };

const FLOOR = 162;

function patrol([left, right], id, time) {
  const span = right - left;
  const distance = (id * 27 + time * (35 + id % 3 * 8)) % (span * 2);
  return { x: left + (distance <= span ? distance : 2 * span - distance), y: FLOOR - 12, w: 13, h: 12, facing: distance <= span ? 1 : -1 };
}

function liftHeight([, base, , travel, period], time) {
  return base - travel * (1 - Math.cos(time * Math.PI * 2 / period)) / 2;
}

export function mountTrail(api) {
  const width = 360, height = 202;
  const canvas = api.canvas(width,height,'风谷探险场景');
  const ctx = canvas.getContext('2d');
  let index = 0, collected, removed, level, solids, gems, pods, lift, player, checkpoint, death, deaths, camera, mode, elapsed, coyote, buffer, clock, endX;
  let records = load('trail-expedition', {});
  const controls = api.controls({ ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',ShiftLeft:'run',ShiftRight:'run',KeyX:'run',KeyP:'pause',Escape:'pause' }, [
    ['left','←',false,'左移'],['right','→',false,'右移'],['run','加速',false],['jump','跳跃',true],['pause','暂停'],
  ], action => {
    if (action === 'jump') buffer = .13;
    if (action === 'pause') pause();
  }, () => mode === 'play');

  const selectLevel = api.select('选择关卡', TRAILS.map((_,i) => [i,'第 '+(i+1)+' 关']), value => start(Number(value)));

  function score() {
    api.hud(['关卡', (index+1) + ' / ' + TRAILS.length], ['碎片', collected.size + ' / ' + (gems.length + pods.filter(pod => pod.kind === 'shard').length)], ['护盾', player.shield ? '有' : '—'], ['失足', deaths], ['用时', clock + ' 秒']);
  }
  function spawn(x) {
    player = { x,y:FLOOR-18,w:13,h:18,vx:0,vy:0,direction:1,grounded:false, shield:false, grace:0 };
    camera = clamp(x - 110, 0, endX-width);
    coyote = buffer = 0;
  }
  function start(next) {
    index = next;
    selectLevel(index);
    level = TRAILS[index];
    endX = level.ground.at(-1)[1];
    const ledges = level.ledges.map(([x,y,w]) => ({x,y,w,h:9,oneWay:true}));
    solids = [...level.ground.map(([a,b]) => ({x:a,y:FLOOR,w:b-a,h:50})), ...ledges];
    gems = ledges.flatMap(({x,y,w}) => [x+9,x+w-14].map(xx => ({x:xx,y:y-13,w:5,h:8})));
    pods = level.pods.map(([x,y,kind], id) => ({x,y,w:17,h:13,kind,id:'pod-' + id,opened:false,bump:0}));
    solids.push(...pods);
    lift = level.lift ? { x:level.lift[0], y:level.lift[1], w:level.lift[2], h:8, oneWay:true } : null;
    if (lift) solids.push(lift);
    collected = new Set();
    removed = new Set();
    checkpoint = null;
    death = 0;
    deaths = 0;
    elapsed = clock = 0;
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
    api.play('fall');
    api.message(checkpoint ? '即将从信标处返回' : '即将从起点返回');
    score();
  }
  function win() {
    mode = 'end';
    const time = Math.round(elapsed * 10) / 10;
    const best = Math.min(time, records[index] ?? Infinity);
    records = { ...records, [index]:best };
    save('trail-expedition', records);
    api.play('clear');
    api.overlay(index === TRAILS.length - 1 ? '探险完成' : '抵达出口', `${time} 秒 · 碎片 ${collected.size} · 最快 ${best} 秒`, [
      index < TRAILS.length-1 ? ['下一关', () => start(index+1)] : ['从头挑战', () => start(0)],
      ['重玩本关', () => start(index)],
    ]);
  }
  function update(dt) {
    if (mode !== 'play') return;
    elapsed += dt;
    const second = Math.floor(elapsed);
    if (second !== clock) { clock = second; score(); }
    if (death) {
      death -= dt;
      if (death <= 0) { death = 0; spawn(checkpoint ?? 22); score(); api.message(level.name + ' · 抵达出口'); }
      return;
    }
    player.grace = Math.max(0, player.grace - dt);
    if (lift) {
      const nextHeight = liftHeight(level.lift, elapsed);
      if (player.surface === lift) player.y += nextHeight - lift.y;
      lift.y = nextHeight;
    }
    const axis = Number(controls.held('right')) - Number(controls.held('left'));
    if (axis) player.direction = axis;
    const running = controls.held('run');
    const speed = axis * (running ? 184 : 132);
    const acceleration = player.grounded ? (axis ? 930 : 1160) : 640;
    player.vx += clamp(speed - player.vx, -acceleration * dt, acceleration * dt);
    player.x = clamp(player.x + player.vx*dt, 0, endX-player.w);
    for (const block of solids) {
      if (block.oneWay || !overlaps(player, block)) continue;
      if (player.vx > 0) player.x = block.x-player.w;
      if (player.vx < 0) player.x = block.x+block.w;
      player.vx = 0;
    }
    if (player.grounded) coyote = .085;
    else coyote = Math.max(0,coyote-dt);
    if (buffer > 0 && coyote > 0) {
      player.vy = -321 - clamp((Math.abs(player.vx) - 130) * .65, 0, 34);
      player.grounded = false;
      player.cutJump = true;
      coyote = buffer = 0;
      api.play('jump');
    }
    if (player.cutJump && !controls.held('jump')) {
      player.vy = Math.max(player.vy, -177);
      player.cutJump = false;
    }
    buffer = Math.max(0, buffer-dt);
    const oldBottom = player.y + player.h;
    player.vy = Math.min(390, player.vy + 700*dt);
    const landingSpeed = player.vy;
    player.y += player.vy*dt;
    player.grounded = false;
    player.surface = null;
    for (const block of solids) {
      if (!overlaps(player, block)) continue;
      if (block.oneWay && (player.vy <= 0 || oldBottom > block.y + .01)) continue;
      if (player.vy > 0) {
        player.y = block.y - player.h;
        player.grounded = true;
        player.surface = block;
      } else {
        player.y = block.y + block.h;
        if (block.kind && !block.opened) {
          block.opened = true;
          block.bump = elapsed;
          if (block.kind === 'shield') { player.shield = true; api.play('shield'); }
          else { collected.add(block.id); api.play('collect'); }
          score();
        }
      }
      player.vy = 0;
    }
    if (player.grounded) {
      player.cutJump = false;
      if (landingSpeed > 165) api.play('land');
    }
    gems.forEach((gem,id) => {
      if (!collected.has(id) && overlaps(player,gem)) { collected.add(id); api.play('collect'); score(); }
    });
    for (const [id, range] of level.drones.entries()) {
      if (removed.has(id)) continue;
      const target = patrol(range, id, elapsed);
      if (!overlaps(player, target)) continue;
      if (landingSpeed > 0 && oldBottom <= target.y + 3) {
        removed.add(id);
        player.y = target.y - player.h;
        player.vy = controls.held('jump') ? -245 : -175;
        player.grounded = player.cutJump = false;
        player.surface = null;
        api.play('stomp');
      } else if (!player.grace) {
        if (!player.shield) { lose(); return; }
        player.shield = false;
        player.grace = 1.1;
        player.vy = -155;
        player.vx = player.x < target.x ? -118 : 118;
        api.play('impact');
        score();
      }
    }
    if (player.y > 220) { lose(); return; }
    if (!checkpoint && player.x >= level.flag && player.x <= level.flag+28 && player.grounded) {
      checkpoint=level.flag; api.play('checkpoint'); api.message('信标已激活');
    }
    if (player.x > endX-49 && player.y > 110) win();
    const target = clamp(player.x - 137 + player.vx * .16, 0, endX-width);
    camera += (target-camera)*Math.min(1,dt*8);
  }
  function drawPod(block) {
    const phase = clamp((elapsed - block.bump) / .22, 0, 1);
    const y = block.y - (block.opened ? Math.sin(phase * Math.PI) * 5 : 0);
    const glow = block.kind === 'shield' ? '#95dded' : '#ffca70';
    rect(ctx,'#182a35',block.x,y,block.w,block.h);
    rect(ctx,block.opened ? '#48565b' : '#4f6871',block.x+1,y+1,15,10);
    rect(ctx,block.opened ? '#788788' : glow,block.x+2,y+1,13,2);
    if (!block.opened) {
      rect(ctx,glow,block.x+7,y+4,3,5);
      rect(ctx,glow,block.x+6,y+7,5,2);
    }
  }
  function draw() {
    landscape(ctx,width,height,camera,index);
    ctx.save();
    ctx.translate(-Math.round(camera),0);
    for (const block of solids) {
      if (block.x + block.w < camera || block.x > camera+width) continue;
      if (block.kind) {
        drawPod(block);
        continue;
      }
      if (block === lift) {
        rect(ctx, '#374f58', block.x, block.y, block.w, block.h);
        rect(ctx, '#b1efc7', block.x + 1, block.y, block.w - 2, 2);
        for (let x = block.x + 3; x < block.x + block.w - 4; x += 7) rect(ctx, '#e8ab52', x, block.y + 4, 4, 2);
        continue;
      }
      rect(ctx,'#233e3f',block.x,block.y,block.w,block.h);
      rect(ctx,'#92b97d',block.x,block.y,block.w,3);
      for (let x = block.x + 5; x < block.x + block.w - 6; x += 13) {
        rect(ctx,'#467257',x,block.y+5,5,2);
        if (!block.oneWay) {
          const drop = 12 + (x % 7);
          rect(ctx,'#365654',x + 2,block.y + drop,6,2);
          rect(ctx,'#1c343b',x - 1,block.y + drop + 13,9,3);
        }
      }
    }
    gems.forEach(({x,y},id) => {
      if (collected.has(id)) return;
      const lift = Math.round(Math.sin(elapsed * 6 + id) * 2);
      rect(ctx,'#f5ba61',x,y+lift,5,8);
      rect(ctx,'#fff4b2',x+1,y+lift+1,2,3);
    });
    level.drones.forEach((range,id) => {
      if (removed.has(id)) return;
      const {x,y,facing} = patrol(range,id,elapsed);
      rect(ctx,'#ad576e',x,y+3,13,8);
      rect(ctx,'#edb17d',x+2,y,9,6);
      rect(ctx,'#472138',x+(facing > 0 ? 8 : 3),y+2,2,3);
      const tread = Math.floor(elapsed * 12) % 3;
      rect(ctx,'#f49584',x+1+tread,y+9,2,2);
      rect(ctx,'#f49584',x+7+tread,y+9,2,2);
    });
    rect(ctx,'#b0bec0',level.flag,130,3,32);
    rect(ctx,checkpoint?'#d4fa82':'#c58487',level.flag-2,130,7,7);
    rect(ctx,'#3c5260',level.flag-4,157,11,5);
    const portal=endX-36;
    rect(ctx,'#c0ed9d',portal,127,20,35);
    rect(ctx,'#36565b',portal+3,132,14,30);
    rect(ctx,'#78af94',portal+8,138,4,17);
    if (!death && (!player.grace || Math.floor(elapsed * 18) % 2)) {
      if (player.shield) {
        ctx.strokeStyle = '#93d9f3';
        ctx.strokeRect(Math.round(player.x - 2), Math.round(player.y - 3), 17, 23);
      }
      const cadence = Math.abs(player.vx) > 150 ? 19 : 12;
      const stride = !player.grounded ? 1 : Math.abs(player.vx) > 20 ? Math.floor(elapsed * cadence) % 2 * 2 : 0;
      rover(ctx,player.x+6,player.y+18,1,player.direction,stride);
    }
    ctx.restore();
  }
  api.restart(() => start(index));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, { signal:api.signal });
  start(0);
  loop(api.signal,update,draw);
}
