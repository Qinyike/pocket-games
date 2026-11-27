import { load, save } from '../engine.js';

const W = 17, H = 13, FLOORS = 8;
const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
const names = ['苔痕水库','失火锻炉','玻璃盐井','倒悬图书馆','无光月台','星砂观测站','沉钟环廊','烬核室'];
export const PATTERNS = {
  scout:{ name:'巡迹者', hp:27, attack:5, focus:5, skill:'影步', detail:'越过一格并造成近战伤害' },
  ward:{ name:'铁卫', hp:36, attack:4, focus:4, skill:'壁垒', detail:'本轮与下一轮格挡' },
  sage:{ name:'引潮师', hp:23, attack:4, focus:7, skill:'脉冲', detail:'对周围两格内的敌人造成伤害' },
};
const creatures = {
  crawler:{name:'苔爪', icon:'爪', hp:6, bite:2, xp:3},
  sentry:{name:'炉哨', icon:'哨', hp:10, bite:3, xp:4},
  caster:{name:'照晶', icon:'晶', hp:8, bite:2, xp:4},
  shell:{name:'壳卫', icon:'壳', hp:18, bite:4, xp:6},
  boss:{name:'守门钟', icon:'钟', hp:31, bite:6, xp:10},
};
const cell = (x,y) => y*W+x;
const px = index => index%W;
const py = index => Math.floor(index/W);
const distance = (a,b) => Math.abs(px(a)-px(b))+Math.abs(py(a)-py(b));
function neighbors(index) {
  return dirs.map(([dx,dy]) => [px(index)+dx,py(index)+dy])
    .filter(([x,y]) => x>=0 && x<W && y>=0 && y<H).map(([x,y])=>cell(x,y));
}
function rng(seed) {
  return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}

export function generateVault(seed, floor) {
  const roll=rng((seed+floor*74111)>>>0);
  const tiles=Array(W*H).fill('#');
  const rooms=Array.from({length:6},(_,i)=>{
    const x=2+(i%3)*5+Math.floor(roll()*2);
    const y=2+Math.floor(i/3)*6+Math.floor(roll()*2);
    for(let row=y-1;row<=y+2;row++) for(let col=x-1;col<=x+2;col++) tiles[cell(col,row)]='.';
    return cell(x,y);
  });
  const route=roll()<.5?[0,1,2,5,4,3]:[0,3,4,1,2,5];
  for (let i=1;i<route.length;i++) {
    let x=px(rooms[route[i-1]]),y=py(rooms[route[i-1]]);
    const end=rooms[route[i]];
    while(x!==px(end)) { x+=Math.sign(px(end)-x); tiles[cell(x,y)]='.'; }
    while(y!==py(end)) { y+=Math.sign(py(end)-y); tiles[cell(x,y)]='.'; }
  }
  const start=rooms[0], exit=rooms[route.at(-1)], seal=rooms[route[3]];
  tiles[exit]='>';
  tiles[seal]='*';
  const open=tiles.flatMap((tile,index)=>tile==='.'&&distance(start,index)>3&&distance(exit,index)>1?[index]:[]);
  function take() {
    const slot=Math.floor(roll()*open.length);
    const index=open[slot];
    open[slot]=open.at(-1); open.pop();
    return index;
  }
  for(let i=0;i<3+floor%2;i++) tiles[take()]=i===0?'+' : i===1?'$':'?';
  for(let i=0;i<floor;i++) tiles[take()]='^';
  const enemies=Array.from({length:3+floor},(_,i)=>{
    const types=floor<3?['crawler','sentry']:['crawler','sentry','caster','shell'];
    const kind=types[Math.floor(roll()*types.length)];
    return {at:take(),kind,hp:creatures[kind].hp+Math.floor(floor/2),active:false,id:i};
  });
  if (floor%4===0) enemies.push({at:neighbors(exit).find(index=>tiles[index]==='.'&&!enemies.some(enemy=>enemy.at===index))??exit,kind:'boss',hp:31+floor*2,active:false,id:enemies.length});
  return {tiles,enemies,start,exit,seen:[]};
}

export function shortestStep(from, to, valid) {
  const seen=new Set([from]);
  const queue=neighbors(from).filter(valid).map(index=>[index,index]);
  queue.forEach(([index])=>seen.add(index));
  for(let read=0;read<queue.length;read++) {
    const [index,first]=queue[read];
    if(index===to) return first;
    for(const next of neighbors(index)) if(!seen.has(next)&&valid(next)) {
      seen.add(next); queue.push([next,first]);
    }
  }
  return null;
}

export function mountExpedition(api) {
  const storage='expedition:run';
  let run=load(storage,null);
  let style=PATTERNS[run?.style]?run.style:'scout', log=Array.isArray(run?.log)?run.log:[], busy=false;
  let best=load('expedition:deepest',0);
  let visible=new Set();
  const scene=document.createElement('section');
  scene.className='campaign expedition';
  scene.innerHTML='<div class="campaign-top"><strong></strong><span></span></div><div class="vault-grid" role="group" aria-label="地牢地图"></div><p class="campaign-note" role="status"></p><div class="campaign-actions"></div><details><summary>行动记录</summary><ol></ol></details>';
  const board=scene.querySelector('.vault-grid'), caption=scene.querySelector('.campaign-top strong');
  const secondary=scene.querySelector('.campaign-top span'), note=scene.querySelector('.campaign-note');
  const actions=scene.querySelector('.campaign-actions'), logList=scene.querySelector('ol');
  api.stage.append(scene);
  const menu=api.select('地牢职业',Object.entries(PATTERNS).map(([key,item])=>[key,item.name]),value=>{
    style=value;
    message('已选'+PATTERNS[style].name+'。按「重开」启用，也可继续本局。');
  });
  menu(style);
  const cells=Array.from({length:W*H},(_,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.tabIndex=-1;
    button.onclick=()=>go(index);
    board.append(button);
    return button;
  });
  function button(label,callback,primary=false) {
    const element=document.createElement('button');
    element.type='button'; element.className=primary?'primary':'quiet';
    element.textContent=label; element.onclick=callback; actions.append(element);
    return element;
  }
  const special=button('绝技',skill,true);
  const potion=button('药剂',heal);
  const wait=button('等一回合',()=>turn());
  const descend=button('下楼',advance,true);
  const train=button('专精 +',choosePerk);

  api.controls({ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',KeyW:'up',KeyD:'right',KeyS:'down',KeyA:'left',KeyQ:'skill',KeyE:'heal',Space:'wait'},[
    ['left','←',false,'向西','tap'],['up','↑',false,'向北','tap'],['down','↓',false,'向南','tap'],['right','→',false,'向东','tap'],
  ], action=>{
    const index=['up','right','down','left'].indexOf(action);
    if(index>=0) {
      const [dx,dy]=dirs[index];
      const x=px(run.at)+dx,y=py(run.at)+dy;
      if(x>=0&&x<W&&y>=0&&y<H) go(cell(x,y));
    } else if(action==='skill') skill();
    else if(action==='heal') heal();
    else turn();
  },()=>run?.state==='play'&&!busy);

  function message(text) {
    note.textContent=text;
    log.unshift(text);
    if(log.length>6) log.pop();
    renderLog();
  }
  function persist() { run.log=log; save(storage,run); }
  function start() {
    const config=PATTERNS[style];
    const seed=Math.floor(Math.random()*4294967296);
    const map=generateVault(seed,1);
    run={style,seed,floor:1,map,at:map.start,hp:config.hp,maxHp:config.hp,power:config.attack,focus:config.focus,maxFocus:config.focus,shield:0,potions:2,xp:0,perks:0,seal:false,coins:0,turns:0,state:'play'};
    busy=false; log=[];
    api.hideOverlay();
    message('找到本层印记，再前往出口。靠近敌人后点它攻击。');
    render();
  }
  function renderLog() {
    logList.replaceChildren(...log.map(line=>{const li=document.createElement('li'); li.textContent=line; return li;}));
  }
  function reveal() {
    visible=new Set(run.map.tiles.flatMap((_,index)=>distance(index,run.at)<=4?[index]:[]));
    run.map.seen=[...new Set([...run.map.seen,...visible])];
  }
  function render() {
    reveal();
    const seen=new Set(run.map.seen);
    const config=PATTERNS[run.style];
    caption.textContent=names[run.floor-1]+' · '+run.floor+'/'+FLOORS;
    secondary.textContent=config.name+' · 第 '+run.turns+' 回合';
    api.hud(['生命',run.hp+'/'+run.maxHp],['专注',run.focus+'/'+run.maxFocus],['碎银',run.coins],['最深',best+' 层']);
    special.textContent=config.skill+' · 2';
    special.title=config.detail;
    potion.textContent='药剂 × '+run.potions;
    train.textContent='专精 · '+run.perks;
    train.disabled=!run.perks||run.state!=='play';
    special.disabled=run.focus<2||run.state!=='play';
    potion.disabled=!run.potions||run.hp>=run.maxHp||run.state!=='play';
    wait.disabled=run.state!=='play';
    descend.disabled=run.at!==run.map.exit||!run.seal||run.map.enemies.some(enemy=>enemy.kind==='boss')||run.state!=='play';
    const enemyAt=new Map(run.map.enemies.map(enemy=>[enemy.at,enemy]));
    const icons={'#':'','?':'匣','*':'印','>':'门','+':'+','$':'银','^':'棘','.':''};
    const labels={'#':'石墙','?':'补给匣','*':'封印','>':'出口','+':'药剂','$':'碎银','^':'陷阱','.':'地面'};
    cells.forEach((button,index)=>{
      const tile=run.map.tiles[index];
      const known=seen.has(index), now=visible.has(index), own=index===run.at;
      const enemy=now?enemyAt.get(index):null;
      button.dataset.terrain= known ? (tile==='#'?'wall':tile==='.'?'floor':tile==='^'?'trap':'object') : 'unknown';
      button.dataset.entity=own?'hero':enemy?'foe':'';
      button.dataset.visible=String(now);
      button.textContent=own?'行':enemy?creatures[enemy.kind].icon:known?icons[tile]:'';
      button.setAttribute('aria-label',own?'当前位置':enemy?creatures[enemy.kind].name+'，生命 '+enemy.hp:known?labels[tile]:'未探索');
    });
    persist();
  }
  function attack(enemy, damage=run.power) {
    enemy.hp-=damage;
    enemy.active=true;
    api.play('hit');
    if(enemy.hp<=0) {
      run.map.enemies=run.map.enemies.filter(item=>item!==enemy);
      run.xp+=creatures[enemy.kind].xp;
      run.coins+=2;
      if(run.xp>=12) { run.xp-=12; run.perks++; }
      message('击倒'+creatures[enemy.kind].name+'，获得经验与碎银。');
    } else message(creatures[enemy.kind].name+'失去 '+damage+' 点生命。');
  }
  function collect() {
    const tile=run.map.tiles[run.at];
    if(tile==='*'){run.seal=true;message('封印解除，出口已开启。');}
    if(tile==='+'){run.potions++;message('取得一瓶药剂。');}
    if(tile==='$'){run.coins+=8;message('找到 8 枚碎银，可在楼层间补给。');}
    if(tile==='?'){run.focus=Math.min(run.maxFocus,run.focus+3);run.potions++;message('打开补给匣，获得药剂及专注。');}
    if(tile==='^'){run.hp=Math.max(0,run.hp-3);message('踩中碎晶，损失 3 点生命。');}
    if(['*','+','$','?','^'].includes(tile)){run.map.tiles[run.at]='.';api.play(tile==='^'?'hit':'take');}
  }
  function go(index) {
    if(run.state!=='play'||busy||index===run.at||run.map.tiles[index]==='#') return;
    const occupied=at=>run.map.enemies.some(enemy=>enemy.at===at);
    if(distance(run.at,index)>1) {
      if(!run.map.seen.includes(index)) return;
      index=shortestStep(run.at,index,at=>run.map.tiles[at]!=='#'&&run.map.seen.includes(at)&&(!occupied(at)||at===index));
      if(index===null) return;
    }
    const enemy=run.map.enemies.find(item=>item.at===index);
    if(enemy) attack(enemy);
    else {run.at=index;collect();}
    turn();
  }
  function strike(enemy,force) {
    const damage=run.shield?Math.max(0,force-4):force;
    if(!damage) return;
    run.hp=Math.max(0,run.hp-damage);
    api.play('hit');
    message(creatures[enemy.kind].name+'造成 '+damage+' 点伤害。');
  }
  function turn() {
    if(run.state!=='play'||busy) return;
    run.turns++;
    if(run.turns%5===0) run.focus=Math.min(run.maxFocus,run.focus+1);
    for(const enemy of run.map.enemies) {
      const gap=distance(run.at,enemy.at);
      enemy.active ||= gap<=4;
      if(!enemy.active||!run.hp) continue;
      const definition=creatures[enemy.kind];
      if(gap===1){strike(enemy,definition.bite);continue;}
      if(enemy.kind==='caster'&&gap<=4&&(px(run.at)===px(enemy.at)||py(run.at)===py(enemy.at))) {
        const stride=px(run.at)===px(enemy.at)?Math.sign(run.at-enemy.at)*W:Math.sign(run.at-enemy.at);
        let clear=true;
        for(let index=enemy.at+stride;index!==run.at;index+=stride) if(run.map.tiles[index]==='#') clear=false;
        if(clear){strike(enemy,definition.bite);continue;}
      }
      const next=shortestStep(enemy.at,run.at,index=>run.map.tiles[index]!=='#'&&!run.map.enemies.some(item=>item!==enemy&&item.at===index));
      if(next!==null&&next!==run.at) enemy.at=next;
    }
    run.shield=Math.max(0,run.shield-1);
    if(!run.hp) run.state='lost';
    render();
    if(run.state==='lost') finish();
  }
  function heal() {
    if(potion.disabled||busy) return;
    run.potions--;
    run.hp=Math.min(run.maxHp,run.hp+11);
    api.play('take');message('恢复生命，敌人也将行动。');turn();
  }
  function skill() {
    if(special.disabled||busy) return;
    const targets=run.map.enemies.filter(enemy=>distance(enemy.at,run.at)<=(run.style==='sage'?2:run.style==='scout'?2:0));
    if(run.style!=='ward'&&!targets.length){message('距离太远，绝技需要两格内有敌人。');return;}
    run.focus-=2;
    if(run.style==='ward'){run.shield=2;message('展开壁垒，接下来两回合减伤。');}
    else if(run.style==='sage') for(const target of targets) attack(target,6+Math.floor(run.power/2));
    else {
      const target=targets[0];
      const next=neighbors(run.at).find(index=>run.map.tiles[index]!=='#'&&distance(index,target.at)===1&&!run.map.enemies.some(enemy=>enemy.at===index));
      if(next!==undefined&&distance(run.at,target.at)>1){run.at=next;collect();}
      attack(target,run.power+4);
    }
    turn();
  }
  function choosePerk() {
    if(train.disabled||busy) return;
    busy=true;
    const choose=(field,amount)=>{
      run[field]+=amount; run.perks--; busy=false;
      if(field==='maxHp') run.hp+=amount;
      if(field==='maxFocus') run.focus+=amount;
      api.hideOverlay();render();
    };
    api.overlay('选择专精','本次探险内生效',[['锋刃 +2',()=>choose('power',2)],['生命 +6',()=>choose('maxHp',6)],['专注 +2',()=>choose('maxFocus',2)],['稍后',()=>{busy=false;api.hideOverlay();}]]);
  }
  function advance() {
    if(descend.disabled||busy) return;
    if(run.floor===FLOORS){run.state='won';best=FLOORS;save('expedition:deepest',best);render();finish();return;}
    busy=true;
    const next=()=>{
      run.floor++; run.map=generateVault(run.seed,run.floor); run.at=run.map.start;
      run.seal=false;run.focus=Math.min(run.maxFocus,run.focus+2);
      run.hp=Math.min(run.maxHp,run.hp+4);
      best=Math.max(best,run.floor);save('expedition:deepest',best);
      busy=false; api.hideOverlay();message('抵达'+names[run.floor-1]+'。');render();
    };
    const choices=[['进入下一层',next]];
    if(run.coins>=10) choices.push(['10 银换药并下楼',()=>{run.coins-=10;run.potions+=2;next();}]);
    choices.push(['继续探索',()=>{busy=false;api.hideOverlay();}]);
    api.overlay('楼层间歇','下楼恢复 4 点生命及 2 点专注。部分楼层的出口由守门钟镇守。',choices);
  }
  function finish() {
    api.play(run.state==='won'?'clear':'fail');
    api.overlay(run.state==='won'?'烬核回收完成':'探险结束','到达第 '+run.floor+' 层 · '+run.turns+' 回合',[['开启新探险',start],['回看地图',api.hideOverlay]]);
  }
  api.restart(()=>{
    if(run.state==='play'&&run.turns) {
      busy=true;
      api.overlay('开启新的远征？','当前远征会被替换，最深纪录会保留。',[['开始新远征',start],['继续当前远征',()=>{busy=false;api.hideOverlay();}]]);
    } else start();
  });
  if(run?.map?.tiles?.length===W*H&&PATTERNS[run.style]) {renderLog();render();if(run.state!=='play')finish();}
  else start();
}
