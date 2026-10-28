import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {executeAction,validateState,projectState,handoff} from '../src/operations.mjs';
import {ITEM_CATALOG} from '../data/items-2024.mjs';
import {openStore} from '../src/store.mjs';
import {newBattleState,openWorkspace,upgradeBattle} from '../src/workspace.mjs';
import {active,fixture,command,dm,player} from './fixture.mjs';

const named=name=>ITEM_CATALOG.find(item=>item.name===name);
const stack=(name,id,quantity=1,extra={})=>({id,itemId:named(name).id,quantity,...extra});
const noRandom=()=>{throw new Error('此操作不应调用程序随机数');};
const initial=()=>{
  const s=upgradeBattle(active(),'test-campaign','test-battle');s.actors[0].hp=30;s.actors[1].hp=20;
  s.actors[0].inventory=[stack('治疗药水','potion',2),stack('基础毒药','poison',2),stack('医疗包','kit',2,{charges:4}),stack('攀爬工具','climber'),stack('燃油','oil',2),stack('板甲','plate'),stack('背包','backpack')];
  s.actors[1].inventory=[stack('治疗药水','secret-npc-stack',3)];s.partyInventory=[stack('治疗药水','potion',4),stack('强酸','acid',3),stack('捕网','net',2)];return s;
};
const use=(patch={})=>({actorId:'pc-001',scope:'personal',stackId:'potion',useId:'drink-feed',manualRolls:[2,3],...patch});
const execute=(s,type,p,principal=dm,options={draw:noRandom})=>executeAction(s,command(s,type,p),principal,options);
const output=fileURLToPath(new URL('../../../../开发记录/临时/物品结算检查/',import.meta.url));
async function directory(){await mkdir(output,{recursive:true});return mkdtemp(join(output,'case-'));}

test('legacy absence validates; personal inventories remain private and party inventory is public',()=>{
  assert.doesNotThrow(()=>validateState(upgradeBattle(fixture(),'test-campaign','test-battle')));
  const s=initial(),view=projectState(s,player);assert.deepEqual(view.partyInventory,s.partyInventory);assert.deepEqual(view.actors[0].inventory,s.actors[0].inventory);assert.equal(view.actors[1].inventory,undefined);assert.equal(JSON.stringify(handoff(s,player)).includes('secret-npc-stack'),false);
  for(const bad of [null,{},[{id:'bad',itemId:'unknown',quantity:1}]]){const n=initial();n.partyInventory=bad;assert.throws(()=>validateState(n));}
  s.actors[0].inventory=[stack('治疗药水','bad',-1)];assert.throws(()=>validateState(s),/数量/);
});

test('DM replaces one inventory at a time and undo removes newly added optional fields',()=>{
  const legacy=upgradeBattle(fixture(),'test-campaign','test-battle'),party=[stack('治疗药水','ours',2)];
  const n=execute(legacy,'edit-inventory',{scope:'party',inventory:party,reason:'建立测试团队背包'});assert.deepEqual(n.partyInventory,party);assert.equal(legacy.partyInventory,undefined);
  const u=execute(n,'undo',{});assert.equal(Object.hasOwn(u,'partyInventory'),false);
  const s=initial(),own=[stack('医疗包','new-kit')],m=execute(s,'edit-inventory',{scope:'personal',actorId:'pc-001',inventory:own,reason:'主持核对个人背包'});assert.deepEqual(m.actors[0].inventory,own);assert.deepEqual(m.partyInventory,s.partyInventory);assert.deepEqual(m.actors[1].inventory,s.actors[1].inventory);assert.deepEqual(execute(m,'undo',{}).actors,s.actors);
  assert.throws(()=>execute(s,'edit-inventory',{scope:'party',inventory:party,reason:'调整团队库存'},player),/DM权限/);assert.throws(()=>execute(s,'edit-inventory',{scope:'personal',inventory:own,reason:'没有角色'}),/指定角色/);
});

test('personal potion heals from catalog dice and consumes only a bonus action and one bottle',()=>{
  const s=initial(),n=execute(s,'use-item',use(),player);
  assert.equal(n.actors[0].hp,37);assert.equal(n.actors[0].inventory[0].quantity,1);assert.equal(n.partyInventory[0].quantity,4);assert.equal(n.actors[1].inventory[0].quantity,3);assert.equal(n.actors[0].economy.bonusUsed,true);assert.equal(n.combat.action,'none');assert.equal(n.combat.attacksUsed,0);
  const event=n.events.at(-1);assert.equal(event.rolls[0].formula,'2d4+2');assert.equal(event.rolls[0].total,7);assert.equal(event.rolls[0].origin,'physical-dice');assert.equal(event.itemUse.consume.quantity,1);assert.deepEqual(event.itemUse.chargedCosts,[{resourceId:'bonus',amount:1}]);assert.ok(event.itemUse.source.path.endsWith('冒险装备.htm'));assert.equal(event.itemUse.before.target.hp,30);assert.equal(event.itemUse.after.target.hp,37);assert.equal(event.itemUse.consumption.quantityRemoved,1);
});

test('potion feeding permits a nearby zero-HP target and caps healing at maximum HP',()=>{
  const s=initial();s.actors[1].hp=38;const n=execute(s,'use-item',use({targetId:'npc-001'}),player);assert.equal(n.actors[1].hp,40);assert.equal(n.actors[0].hp,30);assert.equal(n.events.at(-1).itemUse.effect.restored,2);
  s.actors[1].hp=0;assert.equal(execute(s,'use-item',use({targetId:'npc-001'}),player).actors[1].hp,7);
  for(const patch of [{x:42.5,z:22.5},{x:27.5,y:5,z:22.5}]){const changed=initial();changed.actors[1].position=patch;assert.throws(()=>execute(changed,'use-item',use({targetId:'npc-001'}),player),/同高5尺/);assert.equal(changed.actors[0].inventory[0].quantity,2);}
});

test('team use requires explicit DM accessibility confirmation and never consumes personal stock',()=>{
  const s=initial();assert.throws(()=>execute(s,'use-item',use({scope:'party',partyAccessible:true}),player),/DM权限/);assert.throws(()=>execute(s,'use-item',use({scope:'party'})),/可取用/);assert.throws(()=>execute(s,'use-item',use({scope:'party',partyAccessible:'yes'})),/布尔/);
  const n=execute(s,'use-item',use({scope:'party',partyAccessible:true}));assert.equal(n.partyInventory[0].quantity,3);assert.equal(n.actors[0].inventory[0].quantity,2);assert.equal(n.events.at(-1).itemUse.partyAccessible,true);
});

test('catalog fees and effects cannot be overridden through itemId, consume, result or extra costs',()=>{
  const s=initial(),before=structuredClone(s);
  for(const patch of [{itemId:named('医疗包').id},{consume:{quantity:0}},{result:{heal:1000}},{result:{costs:[]}},{manualCosts:[{resourceId:'action',amount:1}]},{scope:'catalog'},{useId:'unknown'},{stackId:'unknown'}]){assert.throws(()=>execute(s,'use-item',use(patch)));assert.deepEqual(s,before);}
  assert.throws(()=>execute(s,'use-operation',{actorId:'pc-001',operationId:'common:potion'}),/use-item/);
  assert.throws(()=>execute(s,'use-operation',{actorId:'pc-001',operationId:'common:dip'}),/use-item/);
});

test('invalid potion dice or an exhausted bonus action cannot spend inventory or other state',()=>{
  const s=initial(),before=structuredClone(s);
  for(const dice of [[0,2],[5,2],[3],[]]){assert.throws(()=>execute(s,'use-item',use({manualRolls:dice})));assert.deepEqual(s,before);}
  s.actors[0].economy.bonusUsed=true;assert.throws(()=>execute(s,'use-item',use(),player),/附赠动作已使用/);assert.equal(s.actors[0].inventory[0].quantity,2);
  s.actors[0].economy.bonusUsed=false;s.actors[0].inventory[0].quantity=0;assert.throws(()=>execute(s,'use-item',use(),player),/数量/);assert.equal(s.actors[0].economy.bonusUsed,false);
});

test('program healing uses local RNG once, while physical mode requires supplied raw dice',()=>{
  const s=initial();let count=0;const n=execute(s,'use-item',use({manualRolls:undefined}),player,{draw:sides=>{assert.equal(sides,4);count++;return 4;}});assert.equal(count,2);assert.equal(n.actors[0].hp,40);assert.equal(n.events.at(-1).rolls[0].source,'program');
  s.diceMode='physical';assert.throws(()=>execute(s,'use-item',use({manualRolls:undefined}),player),/线下骰/);const m=execute(s,'use-item',use({rollOrigin:'external-tool'}),player);assert.equal(m.events.at(-1).rolls[0].origin,'external-tool');
});

test('adjudicated coating charges its own bonus cost and leaves further effects to the explicit result',()=>{
  const s=initial(),p={actorId:'pc-001',scope:'personal',stackId:'poison',useId:'coat',reason:'已核对武器和涂层时限',result:{}};
  assert.throws(()=>execute(s,'use-item',p,player),/DM权限/);assert.throws(()=>execute(s,'use-item',{...p,reason:''}),/依据/);
  const n=execute(s,'use-item',p);assert.equal(n.actors[0].inventory[1].quantity,1);assert.equal(n.actors[0].economy.bonusUsed,true);assert.equal(n.actors[0].hp,30);assert.equal(n.events.at(-1).itemUse.effect,null);
  assert.throws(()=>execute(s,'use-item',{...p,result:{costs:[{resourceId:'action',amount:1}]}}),/字段/);assert.throws(()=>execute(s,'use-item',{...p,manualRolls:[4]}),/手工记录/);
});

test('attack-replacement items use one attack opportunity and do not add a second entrance action',()=>{
  const s=initial();s.actors[0].attackLimit=2;s.actors[1].resistances=['acid'];
  const n=execute(s,'use-item',{actorId:'pc-001',targetId:'npc-001',scope:'party',partyAccessible:true,stackId:'acid',useId:'throw-acid',reason:'已核对射程、豁免失败与原始伤害',result:{damage:[{type:'acid',amount:8}]}});
  assert.equal(n.combat.action,'attack');assert.equal(n.combat.attacksUsed,1);assert.equal(n.actors[1].hp,16);assert.equal(n.partyInventory[1].quantity,2);assert.deepEqual(n.events.at(-1).itemUse.chargedCosts,[{resourceId:'attack',amount:1}]);
});

test('charge-based medical stock decrements a charge; reusable tools do not invoke default consumption',()=>{
  const s=initial(),kit=execute(s,'use-item',{actorId:'pc-001',targetId:'npc-001',scope:'personal',stackId:'kit',useId:'stabilize',reason:'已核对稳定濒死者条件',result:{}});
  assert.equal(kit.actors[0].inventory[2].quantity,2);assert.equal(kit.actors[0].inventory[2].charges,3);assert.equal(kit.events.at(-1).itemUse.consumption.chargesSpent,1);assert.equal(kit.combat.action,'manual');
  const tool=execute(s,'use-item',{actorId:'pc-001',scope:'personal',stackId:'climber',useId:'anchor',reason:'已核对锚定位置',result:{}});assert.equal(tool.actors[0].inventory[3].quantity,1);assert.equal(tool.events.at(-1).itemUse.consumption,null);
  assert.throws(()=>execute(s,'use-item',{actorId:'pc-001',scope:'personal',stackId:'backpack',useId:'interact',reason:'查看库存',manualCosts:[]}),/仅供查看/);
});

test('manual timing requires an explicit bounded fee list and rejects unknown fields atomically',()=>{
  const s=initial(),p={actorId:'pc-001',scope:'personal',stackId:'oil',useId:'refuel',reason:'已核对燃料和所需时间',result:{}};
  assert.throws(()=>execute(s,'use-item',p),/manualCosts/);assert.throws(()=>execute(s,'use-item',{...p,manualCosts:[null]}),/格式/);assert.throws(()=>execute(s,'use-item',{...p,manualCosts:[{resourceId:'action',amount:1,extra:true}]}),/格式/);
  const n=execute(s,'use-item',{...p,manualCosts:[{resourceId:'action',amount:1}]});assert.equal(n.combat.action,'manual');assert.equal(n.actors[0].inventory[4].quantity,1);
  const free=execute(s,'use-item',{...p,manualCosts:[]});assert.equal(free.combat.action,'none');assert.equal(free.actors[0].inventory[4].quantity,1);
  assert.throws(()=>execute(s,'use-item',{...p,manualCosts:[],result:{position:{x:0,z:0}}}),/字段/);assert.equal(s.actors[0].inventory[4].quantity,2);
  assert.throws(()=>execute(s,'use-item',{...p,manualCosts:[],result:{damage:[{type:'acid',amount:1,alreadyReduced:true}]}}),/伤害/);assert.equal(s.actors[0].inventory[4].quantity,2);
});

test('noncombat DM confirmation allows unconfirmed characters, omits turn fees and still consumes stock',()=>{
  const s=initial();s.combat.phase='preparing';s.actors[0].confirmed=false;const c=structuredClone(s.combat);
  assert.throws(()=>execute(s,'use-item',use(),player),/DM权限/);assert.throws(()=>execute(s,'use-item',use()),/依据/);
  const n=execute(s,'use-item',use({reason:'主持确认休整期间饮药'}));assert.equal(n.actors[0].hp,37);assert.equal(n.actors[0].inventory[0].quantity,1);assert.equal(n.actors[0].economy.bonusUsed,false);assert.deepEqual(n.combat,c);assert.deepEqual(n.events.at(-1).itemUse.chargedCosts,[]);assert.equal(n.events.at(-1).itemUse.inCombat,false);
  const p={actorId:'pc-001',scope:'personal',stackId:'oil',useId:'refuel',reason:'休整期间补充燃料',manualCosts:[]};assert.equal(execute(s,'use-item',p).actors[0].inventory[4].quantity,1);assert.throws(()=>execute(s,'use-item',{...p,manualCosts:[{resourceId:'action',amount:1}]}),/非战斗/);
});

test('item result supports final HP/temporary balance without repeating mitigation or another fee',()=>{
  const s=initial();s.actors[1].resistances=['acid'];s.actors[1].tempHp=6;s.actors[1].tempHpBase=8;
  const n=execute(s,'use-item',{actorId:'pc-001',targetId:'npc-001',scope:'party',partyAccessible:true,stackId:'acid',useId:'throw-acid',reason:'主持核定外部已经完成的最终生命',result:{finalHp:14,finalTempHp:2}});assert.equal(n.actors[1].hp,14);assert.equal(n.actors[1].tempHp,2);assert.equal(n.actors[1].tempHpBase,8);assert.equal(n.combat.attacksUsed,1);
});

test('ownership, hidden targets, replay, stale versions and undo use existing transaction guarantees',()=>{
  const s=initial(),before=structuredClone(s);assert.throws(()=>execute(s,'use-item',use({actorId:'npc-001',stackId:'secret-npc-stack'}),player),/其他角色/);
  s.actors[1].hidden=true;assert.throws(()=>execute(s,'use-item',use({targetId:'npc-001'}),player),/不可见/);s.actors[1].hidden=false;assert.deepEqual(s,before);
  const c=command(s,'use-item',use()),n=executeAction(s,c,player,{draw:noRandom});assert.throws(()=>executeAction(n,c,player,{draw:noRandom}),/已执行/);assert.throws(()=>executeAction(n,command(s,'use-item',use()),player,{draw:noRandom}),/进度已变化/);
  const u=execute(n,'undo',{});assert.deepEqual(u.actors,s.actors);assert.deepEqual(u.partyInventory,s.partyInventory);assert.deepEqual(u.combat,s.combat);assert.ok(u.events[0].undoneBy);assert.deepEqual(u.events[0].rolls[0].values,[2,3]);assert.equal(u.events[0].itemUse.itemId,named('治疗药水').id);
});

test('item receipts and NPC stock stay private while players receive only chosen public text',()=>{
  const s=initial(),n=execute(s,'use-item',use({reason:'私密用途依据secret-item-note',publicNote:'已公开确认一次物品使用'}));
  const projected=projectState(n,player),event=projected.events.at(-1);assert.equal(event.text,'已公开确认一次物品使用');assert.equal(event.itemUse,undefined);assert.equal(event.rolls,undefined);assert.equal(JSON.stringify(projected).includes('secret-item-note'),false);assert.equal(JSON.stringify(projected).includes('secret-npc-stack'),false);assert.equal(projectState(n,dm).events.at(-1).itemUse.reason,'私密用途依据secret-item-note');assert.ok(handoff(n,dm).actions['use-item']);assert.ok(handoff(n,dm).actions['edit-inventory']);
});

test('new battle snapshots copy personal and party stock without sharing arrays or modifying the source',()=>{
  const s=initial(),copy=newBattleState('test-campaign','second','下一场',s);assert.deepEqual(copy.partyInventory,s.partyInventory);assert.deepEqual(copy.actors[0].inventory,s.actors[0].inventory);copy.partyInventory[0].quantity=1;copy.actors[0].inventory[0].quantity=0;assert.equal(s.partyInventory[0].quantity,4);assert.equal(s.actors[0].inventory[0].quantity,2);
  assert.equal(Object.hasOwn(newBattleState('test-campaign','third','空白'), 'partyInventory'),false);
});

test('external party-inventory edits appear in preview, reload and undo; missing fields can be removed',async()=>{
  const dir=await directory(),store=await openStore(dir,initial);try{
    const original=store.state,changed=structuredClone(original);changed.partyInventory[0].quantity=1;await writeFile(store.path,JSON.stringify(changed));const preview=await store.previewFile();assert.ok(preview.changes.some(c=>c.field==='partyInventory'));await store.reloadFile({fingerprint:preview.fingerprint,expectedRevision:preview.revision});assert.equal(store.state.partyInventory[0].quantity,1);await store.dispatch(command(store.state,'undo'),dm);assert.equal(store.state.partyInventory[0].quantity,4);
    const without=store.state;delete without.partyInventory;await writeFile(store.path,JSON.stringify(without));const removal=await store.previewFile();await store.reloadFile({fingerprint:removal.fingerprint,expectedRevision:removal.revision});assert.equal(Object.hasOwn(store.state,'partyInventory'),false);await store.dispatch(command(store.state,'undo'),dm);assert.equal(store.state.partyInventory[0].quantity,4);
  }finally{await store.close();}
});

test('inventory-bearing library import and battle copying preserve independent stock after restart',async()=>{
  const dir=await directory(),config={seedDirectory:dir,workspaceDirectory:join(dir,'.workspace'),initial};let w=await openWorkspace(config);
  try{
    await w.files({...w.selection,operation:'list'},dm);const path=join(dir,'玩家资料.json'),library=JSON.parse(await readFile(path,'utf8'));library.actors[0].inventory=[stack('医疗包','imported',1,{charges:7})];await writeFile(path,JSON.stringify(library));const preview=await w.files({...w.selection,operation:'preview-library',key:'players',ids:['pc-001']},dm);assert.ok(preview.preview.changes[0].fields.some(f=>f.field==='inventory'));await w.files({...w.selection,operation:'apply-library',key:'players',ids:['pc-001'],fingerprint:preview.preview.fingerprint,expectedRevision:preview.preview.revision},dm);assert.equal(w.store.state.actors[0].inventory[0].charges,7);
    const first=w.selection;await w.createBattle({name:'物品下一场',templateBattleId:first.battleId},dm);assert.equal(w.store.state.partyInventory[0].quantity,4);await w.dispatch(command(w.store.state,'edit-inventory',{scope:'party',inventory:[],reason:'本场不携带团队物品'}),dm);await w.select(first,dm);assert.equal(w.store.state.partyInventory[0].quantity,4);await w.close();w=await openWorkspace(config);assert.equal(w.store.state.actors[0].inventory[0].charges,7);assert.equal(w.store.state.partyInventory[0].quantity,4);
  }finally{await w.close();}
});
