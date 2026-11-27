import { clamp, load, loop, save } from '../engine.js';

const COLS=14, ROWS=9, TILE=32;
export const MAPS=[
  {name:'苔桥关', route:[[0,4],[3,4],[3,2],[7,2],[7,6],[11,6],[11,4],[13,4]], cash:140, roof:'#23403b'},
  {name:'赤陶峡', route:[[0,2],[5,2],[5,6],[2,6],[2,8],[10,8],[10,4],[13,4]], cash:155, roof:'#473b34'},
  {name:'双闸渠', route:[[0,6],[3,6],[3,1],[10,1],[10,5],[6,5],[6,7],[13,7]], cash:165, roof:'#263b4a'},
  {name:'碎星环', route:[[0,1],[12,1],[12,7],[2,7],[2,4],[9,4],[9,2],[13,2]], cash:165, roof:'#403950'},
];
export const ARSENAL={
  bolt:{name:'弩塔',cost:52,damage:12,range:2.6,delay:.46,color:'#a8e9a1',blurb:'快速单体',branches:['穿甲','快装']},
  mortar:{name:'震塔',cost:78,damage:18,range:2.9,delay:1.08,color:'#ffc172',blurb:'范围爆破',branches:['大范围','震荡弹']},
  frost:{name:'霜塔',cost:66,damage:6,range:2.4,delay:.64,color:'#88d7ff',blurb:'持续减速',branches:['深冻','冰裂']},
  arc:{name:'弧塔',cost:95,damage:22,range:2.1,delay:.86,color:'#d6a7fb',blurb:'连锁电弧',branches:['长射程','多连锁']},
};
const FOES={
  rush:{name:'疾行',hp:25,speed:2.15,color:'#f4946f',size:.15,reward:7},
  line:{name:'步队',hp:35,speed:1.34,color:'#e3bf78',size:.19,reward:8},
  armor:{name:'重甲',hp:100,speed:.94,color:'#e59892',size:.23,reward:13},
  swarm:{name:'蜂群',hp:18,speed:1.62,color:'#a6d8b4',size:.12,reward:5},
  boss:{name:'破城车',hp:345,speed:.72,color:'#ee6797',size:.30,reward:45},
};
const WAVES=16;
export const towerLimit = wave => 8+Math.floor(wave/4);
const point=(x,y)=>y*COLS+x;

export function routeTiles(map) {
  const output=[map.route[0]];
  for(let i=1;i<map.route.length;i++) {
    const [endX,endY]=map.route[i];
    let [x,y]=output.at(-1);
    while(x!==endX||y!==endY) {
      x+=Math.sign(endX-x); y+=Math.sign(endY-y);output.push([x,y]);
    }
  }
  return output;
}
export function newDefense(index) {
  return {index,cash:MAPS[index].cash,lives:20,wave:0,towers:{},foes:[],queue:[],clock:0,speed:1,paused:false,mode:'build'};
}
export function waveRoster(wave) {
  const patterns=[['line'],['rush','line'],['swarm','line','swarm'],['armor','line','rush']];
  const path=patterns[(wave-1)%4];
  const roster=Array.from({length:6+wave+(wave>8?3:0)},(_,i)=>path[i%path.length]);
  if(wave>=7) roster.splice(4,1,'armor');
  if(wave>=11) roster.splice(8,1,'armor','swarm');
  if(wave%4===0) roster.push('boss');
  return roster;
}
export function launchWave(state) {
  if(state.mode!=='build'||state.wave>=WAVES) return false;
  state.wave++;state.queue=waveRoster(state.wave);state.clock=.25;state.mode='wave';state.paused=false;
  return true;
}
function position(path, progress) {
  const from=Math.min(path.length-1,Math.floor(progress));
  const to=Math.min(path.length-1,from+1);
  const weight=progress-from;
  return [path[from][0]*(1-weight)+path[to][0]*weight,path[from][1]*(1-weight)+path[to][1]*weight];
}
export function towerStats(type,level,branch) {
  const base=ARSENAL[type];
  const stat={damage:base.damage*[1,1.55,2.3][level-1],delay:base.delay,range:base.range,rad:.78,chain:2,slow:.68,shred:false};
  if(branch==='a') {
    if(type==='bolt') stat.shred=true;
    if(type==='mortar') stat.rad=1.35;
    if(type==='frost') stat.slow=.38;
    if(type==='arc') stat.range+=.85;
  }
  if(branch==='b') {
    if(type==='bolt') stat.delay*=.64;
    if(type==='mortar'){stat.damage*=1.18;stat.slow=.72;}
    if(type==='frost') stat.damage*=2.2;
    if(type==='arc') stat.chain=4;
  }
  return stat;
}
export function defenseStep(state,path,dt,shot=()=>{}) {
  if(state.mode!=='wave'||state.paused) return;
  const time=dt*state.speed;
  state.clock-=time;
  if(state.clock<=0&&state.queue.length) {
    const type=state.queue.shift();
    const hp=Math.round(FOES[type].hp*(1+(state.wave-1)*.155+state.index*.12));
    state.foes.push({type,hp,maxHp:hp,progress:0,slow:1,chill:0});
    state.clock=Math.max(.28,.76-state.wave*.021);
  }
  for(const unit of state.foes) {
    unit.chill=Math.max(0,unit.chill-time);
    unit.progress+=time*FOES[unit.type].speed*(unit.chill?unit.slow:1);
    if(unit.progress>=path.length-1) state.lives=Math.max(0,state.lives-(unit.type==='boss'?4:1));
  }
  state.foes=state.foes.filter(unit=>unit.progress<path.length-1);
  for(const [id,tower] of Object.entries(state.towers)) {
    tower.wait=Math.max(0,tower.wait-time);
    if(tower.wait>0) continue;
    const {type,level,branch}=tower;
    const stat=towerStats(type,level,branch);
    const x=Number(id)%COLS,y=Math.floor(Number(id)/COLS);
    const targets=state.foes.filter(unit=>{
      if(unit.hp<=0) return false;
      const [ex,ey]=position(path,unit.progress);
      return Math.hypot(ex-x,ey-y)<=stat.range;
    }).sort((a,b)=>b.progress-a.progress);
    if(!targets.length) continue;
    tower.wait=stat.delay;
    const focus=targets[0], [tx,ty]=position(path,focus.progress);
    let hit=[focus];
    if(type==='mortar') hit=state.foes.filter(unit=>{
      const [ex,ey]=position(path,unit.progress);
      return unit.hp>0&&Math.hypot(ex-tx,ey-ty)<=stat.rad;
    });
    if(type==='arc') hit=targets.slice(0,stat.chain);
    for(const target of hit) {
      target.hp-=stat.damage*(type==='arc'&&target!==focus ? .56 : 1)*(target.type==='armor'&&!stat.shred&&type==='bolt' ? .48 : 1);
      if(type==='frost'||(type==='mortar'&&branch==='b')){target.slow=stat.slow;target.chill=1.35;}
      shot(x,y,...position(path,target.progress),ARSENAL[type].color);
    }
  }
  for(const unit of state.foes) if(unit.hp<=0) state.cash+=FOES[unit.type].reward;
  state.foes=state.foes.filter(unit=>unit.hp>0);
  if(state.lives<=0) state.mode='lost';
  else if(!state.foes.length&&!state.queue.length) {
    state.cash+=19+state.wave;
    state.mode=state.wave===WAVES?'won':'build';
  }
}

export function mountBastion(api) {
  const storage='bastion:run';
  let state=load(storage,null);
  if(!MAPS[state?.index]||!state.towers) state=newDefense(0);
  let medal=load('bastion:medals',{});
  let selected=point(4,4), kind='bolt', sparks=[], elapsed=0, previous='', priorCash=state.cash;
  let path, road;
  const scene=document.createElement('section');
  scene.className='campaign bastion';
  scene.innerHTML='<div class="campaign-top"><strong></strong><span></span></div><canvas width="448" height="288" tabindex="0" aria-label="塔防战场，方向键移动光标，回车建造" role="img"></canvas><div class="bastion-shop"></div><p class="campaign-note" role="status"></p><div class="campaign-actions"></div>';
  api.stage.append(scene);
  const canvas=scene.querySelector('canvas'), ctx=canvas.getContext('2d');
  const note=scene.querySelector('.campaign-note'), actions=scene.querySelector('.campaign-actions');
  const title=scene.querySelector('strong'), activity=scene.querySelector('.campaign-top span');
  const setMap=api.select('防线地图',MAPS.map((map,index)=>[index,map.name]),index=>{
    if(Number(index)===state.index) return;
    const next=Number(index);
    const confirm=()=>{
      state=newDefense(next);setMap(next);configure();
      api.hideOverlay();refresh(true);
    };
    if(state.wave>0&&['build','wave'].includes(state.mode)) {
      const resume=()=>{setMap(state.index);api.hideOverlay();};
      api.overlay('切换地图？','开启新的防守战会替换当前战局。现有勋章仍保留。',[['开启新地图',confirm],['留在当前地图',resume]]);
    } else confirm();
  });
  function configure() {
    path=routeTiles(MAPS[state.index]);
    road=new Set(path.map(([x,y])=>point(x,y)));
    selected=Array.from({length:COLS*ROWS},(_,index)=>index).find(index=>!road.has(index)&&path.some(([x,y])=>Math.abs(index%COLS-x)+Math.abs(Math.floor(index/COLS)-y)===1))??0;
    setMap(state.index); sparks=[];
  }
  configure();
  function action(label,callback,important=false,parent=actions) {
    const node=document.createElement('button');
    node.type='button';node.textContent=label;node.className=important?'primary':'quiet';node.onclick=callback;parent.append(node);return node;
  }
  const shop=Object.entries(ARSENAL).map(([id,def])=>action(def.name+' '+def.cost,()=>{kind=id;refresh(true);},false,scene.querySelector('.bastion-shop')));
  const build=action('建塔',interact,true);
  const upgradeA=action('升级',()=>upgrade('a'));
  const upgradeB=action('专精',()=>upgrade('b'));
  const sell=action('拆塔',()=>{
    const tower=state.towers[selected];
    if(!tower||!playing()) return;
    state.cash+=Math.floor(tower.paid*.65);delete state.towers[selected];api.play('build');refresh(true);
  });
  const wave=action('开始来袭',()=>{
    if(launchWave(state)){api.play('wave');refresh(true);}
  },true);
  const speed=action('加速',()=>{state.speed=state.speed===1?2:1;refresh(true);});
  const pause=action('暂停',()=>{if(state.mode==='wave'){state.paused=!state.paused;refresh(true);}});
  function playing() { return state.mode==='wave'||state.mode==='build'; }
  function interact() {
    if(!playing()||road.has(selected)||state.towers[selected]||Object.keys(state.towers).length>=towerLimit(state.wave)) return;
    const cost=ARSENAL[kind].cost;
    if(state.cash<cost) return;
    state.cash-=cost;
    state.towers[selected]={type:kind,level:1,branch:null,wait:0,paid:cost};
    api.play('build');refresh(true);
  }
  function upgrade(branch) {
    const tower=state.towers[selected];
    if(!tower||tower.level>=3||!playing()) return;
    const cost=Math.round(ARSENAL[tower.type].cost*(tower.level===1 ? .72 : 1.12));
    if(cost>state.cash) return;
    state.cash-=cost;tower.paid+=cost;tower.level++;
    if(tower.level===3) tower.branch=branch;
    api.play('build');refresh(true);
  }
  function refresh(force=false) {
    const signature=[state.cash,state.lives,state.wave,state.mode,state.foes.length,state.queue.length,state.speed,state.paused,kind,selected].join('|');
    if(!force&&signature===previous) return;
    previous=signature;
    const tower=state.towers[selected], chosen=ARSENAL[kind];
    title.textContent=MAPS[state.index].name;
    activity.textContent=(state.mode==='wave'?'入侵剩余 '+(state.foes.length+state.queue.length):state.mode==='build'?'建造阶段':'战局结束')+' · 波次 '+state.wave+'/'+WAVES;
    api.hud(['核心',state.lives],['资金',state.cash],['塔',Object.keys(state.towers).length+'/'+towerLimit(state.wave)],['勋章',medal[state.index]??'—']);
    shop.forEach((node,index)=>node.setAttribute('aria-pressed',String(Object.keys(ARSENAL)[index]===kind)));
    const atLimit=Object.keys(state.towers).length>=towerLimit(state.wave);
    build.disabled=!playing()||Boolean(tower)||road.has(selected)||state.cash<chosen.cost||atLimit;
    build.textContent='建'+chosen.name;
    if(tower) {
      const def=ARSENAL[tower.type];
      const cost=Math.round(def.cost*(tower.level===1 ? .72 : 1.12));
      upgradeA.hidden=tower.level>=3;
      upgradeB.hidden=tower.level!==2;
      upgradeA.disabled=upgradeB.disabled=!playing()||state.cash<cost;
      upgradeA.textContent=(tower.level===1?'升至 2 级':def.branches[0])+' · '+cost;
      upgradeB.textContent=def.branches[1]+' · '+cost;
      note.textContent=def.name+' · '+tower.level+' 级'+(tower.branch?' · '+def.branches[tower.branch==='a'?0:1]:'')+'。可拆塔返还 65% 资金。';
    } else {
      upgradeA.hidden=upgradeB.hidden=true;
      const next=state.mode==='build'&&state.wave<WAVES?[...new Set(waveRoster(state.wave+1))].map(type=>FOES[type].name).join('、'):'';
      const advice=next?' 下一波：'+next+'。':'';
      note.textContent=(atLimit?'塔位已满，升级或拆除现有塔。':road.has(selected)?'敌人沿道路行进，选旁边的地块建塔。':chosen.name+' · '+chosen.blurb+'。点地块选位，再按建塔。')+advice;
    }
    sell.hidden=!tower; sell.disabled=!playing();
    wave.disabled=state.mode!=='build';
    wave.textContent='开始第 '+Math.min(state.wave+1,WAVES)+' 波';
    speed.textContent=state.speed+'× 速度';
    pause.disabled=state.mode!=='wave';pause.textContent=state.paused?'继续':'暂停';
    if(force) save(storage,state);
  }
  canvas.addEventListener('pointerup',event=>{
    const rect=canvas.getBoundingClientRect();
    const col=clamp(Math.floor((event.clientX-rect.left)*COLS/rect.width),0,COLS-1);
    const row=clamp(Math.floor((event.clientY-rect.top)*ROWS/rect.height),0,ROWS-1);
    selected=point(col,row);refresh(true);
  },{signal:api.signal});
  canvas.addEventListener('keydown',event=>{
    const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const delta=moves[event.key];
    if(delta) {
      event.preventDefault();
      selected=point(clamp(selected%COLS+delta[0],0,COLS-1),clamp(Math.floor(selected/COLS)+delta[1],0,ROWS-1));refresh(true);
    } else if(event.key==='Enter'){event.preventDefault();interact();}
  },{signal:api.signal});
  function end() {
    if(state.mode==='won') {
      const ranks=['铜','银','金'];
      const rank=state.lives>=16?2:state.lives>=9?1:0;
      medal[state.index]=ranks[Math.max(rank,ranks.indexOf(medal[state.index]))];
      save('bastion:medals',medal);
    }
    api.play(state.mode==='won'?'clear':'fail');
    const restart=()=>{state=newDefense(state.index);configure();api.hideOverlay();refresh(true);};
    api.overlay(state.mode==='won'?'防线守住了':'核心失守','守到第 '+state.wave+' 波 · 核心剩余 '+state.lives,[['再守一局',restart],['回看地图',api.hideOverlay]]);
  }
  function update(dt) {
    if(api.stage.querySelector('.overlay')) return;
    const oldMode=state.mode;
    defenseStep(state,path,dt,(x,y,a,b,color)=>sparks.push({x,y,a,b,color,life:.12}));
    for(const spark of sparks) spark.life-=dt;
    sparks=sparks.filter(spark=>spark.life>0);
    if(state.cash>priorCash&&state.mode==='wave') api.play('hit');
    priorCash=state.cash;
    if(state.mode!==oldMode) {
      refresh(true);
      if(!playing()) end();
    }
    elapsed+=dt;
    if(elapsed>=.35){elapsed=0;refresh();if(state.mode==='wave') save(storage,state);}
  }
  function draw() {
    ctx.fillStyle=MAPS[state.index].roof;ctx.fillRect(0,0,448,288);
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
      const id=point(x,y);
      ctx.fillStyle=road.has(id)?'#896b58':(x+y)%2?'#ffffff0c':'#111c252c';
      ctx.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
    }
    const [gx,gy]=path.at(-1);
    ctx.fillStyle='#e7c888';ctx.fillRect(gx*TILE+5,gy*TILE+5,22,22);
    for(const [id,tower] of Object.entries(state.towers)){
      const x=Number(id)%COLS*TILE+16,y=Math.floor(Number(id)/COLS)*TILE+16;
      ctx.fillStyle='#17252f';ctx.fillRect(x-12,y-11,24,24);
      ctx.fillStyle=ARSENAL[tower.type].color;ctx.beginPath();ctx.arc(x,y,8+tower.level,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#233149';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x-5,y+5);ctx.lineTo(x+6,y-5);ctx.stroke();
      ctx.fillStyle='#f8e4a2';for(let n=0;n<tower.level;n++)ctx.fillRect(x-5+n*5,y+10,3,3);
    }
    const tower=state.towers[selected], sx=selected%COLS*TILE,sy=Math.floor(selected/COLS)*TILE;
    ctx.strokeStyle=road.has(selected)?'#d38478':'#f5d795';ctx.lineWidth=2;ctx.strokeRect(sx+2,sy+2,28,28);
    if(tower){ctx.strokeStyle='#f4d79566';ctx.beginPath();ctx.arc(sx+16,sy+16,towerStats(tower.type,tower.level,tower.branch).range*TILE,0,Math.PI*2);ctx.stroke();}
    for(const unit of state.foes){
      const [a,b]=position(path,unit.progress),x=a*TILE+16,y=b*TILE+16,foe=FOES[unit.type];
      ctx.fillStyle=unit.chill?'#9adbf3':foe.color;ctx.beginPath();ctx.arc(x,y,foe.size*TILE,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#1a232f';ctx.fillRect(x-9,y-13,18,3);
      ctx.fillStyle='#f0dfad';ctx.fillRect(x-9,y-13,18*unit.hp/unit.maxHp,2);
    }
    for(const spark of sparks){
      ctx.strokeStyle=spark.color;ctx.globalAlpha=spark.life/.12;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(spark.x*TILE+16,spark.y*TILE+16);ctx.lineTo(spark.a*TILE+16,spark.b*TILE+16);ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  api.restart(()=>{
    const restart=()=>{state=newDefense(state.index);configure();api.hideOverlay();refresh(true);};
    if(state.wave&&playing()) api.overlay('重开本战？','地图与波次进度会重置。',[['重开',restart],['继续',api.hideOverlay]]);
    else restart();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.mode==='wave')state.paused=true;refresh(true);}},{signal:api.signal});
  refresh(true);
  if(!playing()) end();
  loop(api.signal,update,draw);
}
