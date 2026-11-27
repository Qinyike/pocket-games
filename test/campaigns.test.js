import assert from 'node:assert/strict';
import test from 'node:test';
import { generateVault, shortestStep } from '../src/games/expedition.js';
import { ARSENAL, MAPS, routeTiles, newDefense, launchWave, defenseStep, towerLimit } from '../src/games/bastion.js';
import { buildingError, createHarbor, harborDay, shipContract } from '../src/games/harbor.js';

test('seeded vaults always connect their entrance, seal and exit', () => {
  for (let seed=1;seed<=24;seed++) for(let floor=1;floor<=8;floor++) {
    const map=generateVault(seed,floor);
    const seal=map.tiles.indexOf('*');
    assert.notEqual(shortestStep(map.start,seal,index=>map.tiles[index]!=='#'),null);
    assert.notEqual(shortestStep(seal,map.exit,index=>map.tiles[index]!=='#'),null);
    assert.equal(new Set(map.enemies.map(enemy=>enemy.at)).size,map.enemies.length);
    assert.equal(map.enemies.filter(enemy=>enemy.kind==='boss').length,floor%4===0?1:0);
    assert.deepEqual(generateVault(seed,floor),map);
  }
});

for (const [index,map] of MAPS.entries()) {
  test(`all sixteen waves are defendable on ${map.name} with a paid build and upgrade strategy`, () => {
    const defense=newDefense(index), path=routeTiles(map);
    const road=new Set(path.map(([x,y])=>y*14+x));
    for(let wave=1;wave<=16;wave++) {
      while(defense.cash>=37) {
        let best=null, score=0;
        const slots=Object.keys(defense.towers).length;
        for(let id=0;id<126;id++) {
          if(road.has(id)) continue;
          const tower=defense.towers[id];
          if(tower?.level===3 || (!tower&&slots>=towerLimit(defense.wave))) continue;
          for(const [kind,def] of Object.entries(ARSENAL)) {
            if(tower&&tower.type!==kind) continue;
            const cost=tower?Math.round(def.cost*(tower.level===1?.72:1.12)):def.cost;
            if(cost>defense.cash) continue;
            const coverage=path.filter(([x,y])=>Math.hypot(x-id%14,y-Math.floor(id/14))<=def.range).length;
            const indexWeight=kind==='mortar'?1.56:kind==='frost'?.65:1;
            const value=coverage*def.damage/def.delay/cost*indexWeight;
            if(value>score) { score=value;best={id,kind,cost,tower}; }
          }
        }
        if(!best) break;
        const {id,kind,cost,tower}=best;
        defense.cash-=cost;
        defense.towers[id]=tower?{...tower,level:tower.level+1,branch:kind==='bolt'?'a':'b'}:{type:kind,level:1,branch:null,wait:0,paid:cost};
      }
      assert(launchWave(defense));
      for(let frame=0; frame<4800&&defense.mode==='wave';frame++) defenseStep(defense,path,.025);
      assert(defense.lives>0,`lost on wave ${wave}`);
    }
    assert.equal(defense.mode,'won');
  });
}

test('a connected harbor can grow resources and deliver the first contract', () => {
  const city=createHarbor();
  assert.equal(buildingError(city,0,'cabin'),'这里不能建造');
  assert.equal(buildingError(city,60,'cabin'),'请先将栈道接到这里');
  assert.equal(buildingError(city,30,'cabin'),'');
  city.map[30]='cabin';
  assert.equal(buildingError(city,20,'timber'),'');
  city.map[20]='timber';
  assert.equal(shipContract(city),false);
  harborDay(city);
  assert.equal(city.stock[0],8);
  assert(shipContract(city));
  assert.equal(city.contract,1);
});
