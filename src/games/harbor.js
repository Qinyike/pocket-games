import { load, save } from '../engine.js';

const W=9,H=7;
const PORT=3*W+1;
const goods=['木料','矿石','组件','口粮'];
const blocks={
  road:{label:'栈道',icon:'·',price:4,color:'#6b8491',detail:'连到港口后，为相邻建筑接通物流。'},
  cabin:{label:'宿舍',icon:'居',price:20,color:'#789fb7',detail:'提供 4 名工人。'},
  timber:{label:'林场',icon:'木',price:18,workers:2,output:[0,3],color:'#83b68b',detail:'林地建造。每天产出 3 木料。'},
  quarry:{label:'矿场',icon:'矿',price:23,workers:2,output:[1,2],color:'#b3a390',detail:'岩地建造。每天产出 2 矿石。'},
  garden:{label:'温室',icon:'粮',price:24,workers:2,output:[3,4],color:'#acd08b',detail:'每天产出 4 口粮。'},
  wind:{label:'风机',icon:'电',price:30,color:'#7fc4b9',detail:'每天提供 4 电力。'},
  factory:{label:'工坊',icon:'件',price:38,workers:3,power:2,input:[1,1,0,0],output:[2,2],color:'#d39399',detail:'1 木料 + 1 矿石 → 2 组件。'},
  store:{label:'仓库',icon:'仓',price:26,color:'#d0b179',detail:'所有物资容量 +14。'},
  lab:{label:'研究站',icon:'研',price:48,workers:2,power:2,input:[0,0,1,0],research:2,color:'#ab9fcd',tier:2,detail:'每天将 1 组件转为 2 知识。'},
  wharf:{label:'贸易站',icon:'贸',price:36,workers:2,power:1,input:[0,0,1,1],income:13,color:'#79c7c6',tier:2,detail:'1 组件 + 1 口粮 → 13 资金。'},
  turbine:{label:'潮电机',icon:'潮',price:53,color:'#90b0e5',tier:3,detail:'邻接水面建造，提供 9 电力。'},
  fabricator:{label:'机械厂',icon:'机',price:65,workers:4,power:4,input:[1,2,0,0],output:[2,5],color:'#cea6cc',tier:3,detail:'1 木料 + 2 矿石 → 5 组件。'},
};
export const CONTRACTS=[
  {name:'第一船木料',need:[8,0,0,0],reward:32},
  {name:'采石航标',need:[4,8,0,0],reward:46},
  {name:'救援补给',need:[0,0,0,12],reward:38},
  {name:'修复浮桥',need:[6,3,6,0],reward:68},
  {name:'冬季储备',need:[10,0,0,16],reward:67},
  {name:'跨岛电网',need:[3,8,10,0],reward:95},
  {name:'外岛工地',need:[12,11,12,4],reward:116},
  {name:'浮空航标',need:[8,16,18,5],reward:145},
  {name:'远洋护航',need:[12,8,18,16],reward:164},
  {name:'重启海上灯城',need:[18,15,24,20],reward:220},
];
const regions=[
  {name:'晨潮湾', water:[0,1,2,8,9,17,18,26,27,35,36,44,45,53,54,55,61,62],forest:[12,13,15,20,21,23,30,31,39,47,49,51],rock:[5,6,14,16,33,34,41,50,57,59]},
  {name:'旧灯群岛',water:[0,1,7,8,9,17,18,24,26,27,35,36,42,44,45,53,54,55,60,61,62],forest:[11,12,15,20,22,30,31,37,38,48,51,52],rock:[3,5,6,13,16,23,25,32,34,46,50,58,59]},
  {name:'盐脊壁港',water:[0,1,2,6,7,8,9,16,17,18,26,27,35,36,43,44,45,53,54,55,61,62],forest:[4,11,14,20,22,30,31,37,38,47,51,56],rock:[3,5,12,15,23,24,32,33,34,41,50,57,59,60]},
];
function nearby(index) {
  const x=index%W,y=Math.floor(index/W);
  return [x>0?index-1:-1,x<W-1?index+1:-1,y>0?index-W:-1,y<H-1?index+W:-1].filter(item=>item>=0);
}
const dayEvents={
  6:['逆风封航',0],12:['顺风到港',6],17:['雷雨',-2],23:['渔市丰收',7],29:['机械检查',-3],35:['长风季',10],
};
const totalNeed = (stock,need) => need.every((count,index)=>stock[index]>=count);
export function createHarbor(region=0) {
  const terrain=Array(W*H).fill('land');
  for(const type of ['water','forest','rock']) for(const index of regions[region][type]) terrain[index]=type;
  const map=Array(W*H).fill(null);
  terrain[PORT]='land';terrain[PORT+1]='land';
  map[PORT]='port';map[PORT+1]='road';
  return {region,terrain,map,cash:115,stock:[5,3,0,5],day:1,knowledge:0,tier:1,contract:0,done:false,log:['港口期待第一批木料。先修宿舍和林场。']};
}
function reach(state) {
  const connected=new Set([PORT]), queue=[PORT];
  for(let index=0;index<queue.length;index++){
    for(const link of nearby(queue[index])) if(state.map[link]==='road'&&!connected.has(link)){
      connected.add(link);queue.push(link);
    }
  }
  return connected;
}
export function harborStatus(state) {
  const links=reach(state);
  const active=state.map.flatMap((kind,index)=>blocks[kind]&&kind!=='road'&&nearby(index).some(link=>links.has(link))?[index]:[]);
  const counts={active,links,workers:0,power:0,cap:24};
  for(const index of active) {
    const kind=state.map[index];
    if(kind==='cabin') counts.workers+=4;
    if(kind==='wind') counts.power+=4;
    if(kind==='turbine') counts.power+=9;
    if(kind==='store') counts.cap+=14;
  }
  return counts;
}
export function buildingError(state,index,kind) {
  const def=blocks[kind], land=state.terrain[index];
  if(!def||!land||land==='water') return '这里不能建造';
  if(state.map[index]) return '地块已被占用';
  if((def.tier??1)>state.tier) return '须解锁更高等级';
  if(state.cash<def.price) return '资金不足';
  if(kind==='timber'&&land!=='forest') return '林场须建在林地';
  if(kind==='quarry'&&land!=='rock') return '矿场须建在岩地';
  if(kind==='turbine'&&!nearby(index).some(neighbor=>state.terrain[neighbor]==='water')) return '潮电机须邻接水面';
  if(!nearby(index).some(neighbor=>reach(state).has(neighbor))) return '请先将栈道接到这里';
  return '';
}
export function harborDay(state) {
  const {active,workers,power,cap}=harborStatus(state);
  const event=dayEvents[state.day%40];
  let hands=workers, volts=Math.max(0,power+(event?.[1]<0?event[1]:0));
  let income=7+(event?.[1]>0?event[1]:0), idle=0;
  const production=[...active].sort((a,b)=>Number(Boolean(blocks[state.map[a]].input))-Number(Boolean(blocks[state.map[b]].input)));
  for(const index of production) {
    const def=blocks[state.map[index]];
    if(!def.workers) continue;
    if(hands<def.workers||volts<(def.power??0)||(def.input&&!totalNeed(state.stock,def.input))) {
      idle++;continue;
    }
    if(def.output&&state.stock[def.output[0]]>=cap) {idle++;continue;}
    hands-=def.workers;
    volts-=def.power??0;
    if(def.input) def.input.forEach((count,i)=>{state.stock[i]-=count;});
    if(def.output) state.stock[def.output[0]]=Math.min(cap,state.stock[def.output[0]]+def.output[1]);
    if(def.research) state.knowledge+=def.research;
    if(def.income) income+=def.income;
  }
  if(state.knowledge>=14&&state.tier<3) state.tier=3;
  state.cash+=income;
  state.day++;
  state.log.unshift((event?event[0]+' · ':'')+'日结收入 '+income+'，'+(idle?idle+' 座生产设施停工。':'所有可用设施正常运转。'));
  state.log=state.log.slice(0,6);
  return {income,idle,hands,volts};
}
export function shipContract(state) {
  const current=CONTRACTS[state.contract];
  if(!current||!totalNeed(state.stock,current.need)) return false;
  current.need.forEach((value,index)=>{state.stock[index]-=value;});
  state.cash+=current.reward;
  state.contract++;
  if(state.contract>=3) state.tier=Math.max(2,state.tier);
  if(state.contract===CONTRACTS.length) state.done=true;
  return true;
}

export function mountHarbor(api) {
  const storage='harbor:city';
  let state=load(storage,null);
  if(state?.map?.length!==W*H||!regions[state.region]) state=createHarbor();
  let chosen='cabin',selected=PORT+2;
  const scene=document.createElement('section');
  scene.className='campaign harbor';
  scene.innerHTML='<div class="campaign-top"><strong></strong><span></span></div><div class="harbor-stats"></div><div class="harbor-grid" role="group" aria-label="港口建设地图"></div><p class="campaign-note" role="status"></p><div class="campaign-actions"></div><div class="harbor-contract"></div><div class="harbor-shop"></div><details><summary>集市与收支</summary><div class="harbor-market"></div><ol></ol></details>';
  api.stage.append(scene);
  const board=scene.querySelector('.harbor-grid'), note=scene.querySelector('.campaign-note');
  const log=scene.querySelector('ol'), stocks=scene.querySelector('.harbor-stats');
  const actionBar=scene.querySelector('.campaign-actions'), shop=scene.querySelector('.harbor-shop');
  const market=scene.querySelector('.harbor-market'), contract=scene.querySelector('.harbor-contract');
  const label=scene.querySelector('strong'), era=scene.querySelector('.campaign-top span');
  const menu=api.select('经营港湾',regions.map(({name},index)=>[index,name]),index=>{
    const region=Number(index);
    if(region!==state.region) confirm(region);
  });
  menu(state.region);
  function addButton(parent,text,callback,primary=false){
    const node=document.createElement('button');
    node.type='button';node.className=primary?'primary':'quiet';node.textContent=text;node.onclick=callback;parent.append(node);return node;
  }
  const build=addButton(actionBar,'建造',place,true);
  const remove=addButton(actionBar,'拆除',demolish);
  function advance(days) {
    for(let day=0;day<days;day++) harborDay(state);
    api.play('day');
    render(days===1?'一天结算完成。':days+' 天结算完成。');
  }
  const endDay=addButton(actionBar,'推进一天',()=>advance(1),true);
  addButton(actionBar,'推进五天',()=>advance(5));
  const ship=addButton(actionBar,'交付订单',()=>{
    const current=CONTRACTS[state.contract];
    if(!shipContract(state)) return;
    state.log.unshift('交付「'+current.name+'」，获得 '+current.reward+' 资金。');
    api.play(state.done?'clear':'trade');
    render(state.done?'灯城点亮。可以继续经营。':'货船已离港。');
    if(state.done) api.overlay('灯城重新点亮','第 '+state.day+' 天 · 完成 '+CONTRACTS.length+' 笔订单',[['继续经营',api.hideOverlay],['新建港湾',()=>confirm(state.region)]]);
  });
  const prices=[4,6,9,4];
  const marketButtons=goods.map((good,index)=>{
    const buy=addButton(market,'买'+good+' '+(prices[index]+3),()=>trade(index,true));
    const sell=addButton(market,'卖'+good+' '+prices[index],()=>trade(index,false));
    return {buy,sell};
  });
  const buildings=Object.entries(blocks).map(([kind,def])=>{
    const node=addButton(shop,def.label+' '+def.price,()=>{chosen=kind;render();});
    node.title=def.detail;return {kind,node};
  });
  const cells=state.map.map((_,index)=>{
    const node=document.createElement('button');
    node.type='button';node.onclick=()=>{selected=index;render();};board.append(node);return node;
  });
  function confirm(region) {
    api.overlay('开启新港湾？','此操作会替换当前港湾的进度。',[['开启新港湾',()=>{
      state=createHarbor(region);selected=PORT+2;chosen='cabin';menu(region);api.hideOverlay();render();
    }],['继续当前港湾',()=>{menu(state.region);api.hideOverlay();}]]);
  }
  function place() {
    const error=buildingError(state,selected,chosen);
    if(error){render(error);return;}
    state.cash-=blocks[chosen].price;
    state.map[selected]=chosen;
    api.play('build'); render(blocks[chosen].label+'已启用。');
  }
  function demolish() {
    const kind=state.map[selected];
    if(!blocks[kind]) return;
    state.map[selected]=null;
    state.cash+=Math.floor(blocks[kind].price*.45);
    api.play('build');render('地块已清理。');
  }
  function trade(index,buy) {
    if(buy) {
      const cost=prices[index]+3;
      if(state.cash<cost||state.stock[index]>=harborStatus(state).cap) return;
      state.cash-=cost;state.stock[index]++;
    } else {
      if(!state.stock[index]) return;
      state.stock[index]--;state.cash+=prices[index];
    }
    api.play('trade');render();
  }
  function render(message='') {
    const summary=harborStatus(state),kind=state.map[selected],error=buildingError(state,selected,chosen);
    const active=new Set(summary.active);
    api.hud(['资金',state.cash],['工人',summary.workers],['电力',summary.power],['等级',state.tier+'/3']);
    label.textContent=regions[state.region].name;
    era.textContent='第 '+state.day+' 天 · 知识 '+state.knowledge+'/14';
    stocks.textContent=goods.map((name,index)=>name+' '+state.stock[index]+'/'+summary.cap).join('　');
    const def=blocks[chosen];
    let info=def.label+' · '+def.detail+(error?' '+error:'');
    if(kind) info=kind==='port'?'港口主站 · 所有栈道从这里接出。':blocks[kind].label+' · '+(kind==='road'?summary.links.has(selected)?'已连通':'已断开':active.has(selected)?'已接通物流':'物流断开');
    note.textContent=message||info;
    build.disabled=Boolean(error);build.textContent='建'+def.label+' · '+def.price;
    remove.disabled=!blocks[kind];
    endDay.title='推进生产与订单';
    const order=CONTRACTS[state.contract];
    ship.disabled=!order||!totalNeed(state.stock,order.need);
    contract.textContent=order?'订单 '+(state.contract+1)+'/'+CONTRACTS.length+' · '+order.name+' · '+order.need.map((count,index)=>count?goods[index]+' '+count:'').filter(Boolean).join('、'):'所有订单已完成 · 港湾可继续发展';
    buildings.forEach(({kind,node})=>{
      node.disabled=(blocks[kind].tier??1)>state.tier;
      node.setAttribute('aria-pressed',String(chosen===kind));
    });
    marketButtons.forEach(({buy,sell},index)=>{buy.disabled=state.cash<prices[index]+3||state.stock[index]>=summary.cap;sell.disabled=!state.stock[index];});
    const terrainNames={water:'海水',land:'陆地',forest:'林地',rock:'岩地'};
    cells.forEach((node,index)=>{
      const type=state.map[index], ground=state.terrain[index];
      node.dataset.ground=ground;
      node.dataset.selected=String(index===selected);
      node.dataset.disconnected=String(Boolean(type&&type!=='port'&&(type==='road'?!summary.links.has(index):!active.has(index))));
      node.textContent=type==='port'?'港':blocks[type]?.icon??(ground==='forest'?'♧':ground==='rock'?'▴':ground==='water'?'≈':'');
      node.style.setProperty('--building',blocks[type]?.color??(type==='port'?'#f4c995':''));
      node.setAttribute('aria-label','第 '+(Math.floor(index/W)+1)+' 行第 '+(index%W+1)+' 列，'+(type==='port'?'港口':blocks[type]?.label??terrainNames[ground]));
    });
    log.replaceChildren(...state.log.slice(0,6).map(text=>{const item=document.createElement('li');item.textContent=text;return item;}));
    save(storage,state);
  }
  api.restart(()=>confirm(state.region));
  render();
}
