import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAction,validateState} from '../src/operations.mjs';
import {ITEM_CATALOG} from '../data/items-2024.mjs';
import {validateInventory} from '../src/inventory.mjs';
import {createClassTestActors} from '../src/testing-presets.mjs';
import {upgradeBattle} from '../src/workspace.mjs';
import {fixture,active,command,dm,player} from './fixture.mjs';

const seed=()=>upgradeBattle(fixture(),'test-campaign','test-battle');
const noRoll=()=>{throw new Error('导入测试预设不应掷骰');};
const step=(state,payload,principal=dm)=>executeAction(state,command(state,'add-testing-actors',payload),principal,{draw:noRoll});
const unchangedAfterFailure=(state,payload,principal=dm,check)=>{
  const before=structuredClone(state);
  assert.throws(()=>step(state,payload,principal),check);
  assert.deepEqual(state,before);
};
const catalogIds=()=>ITEM_CATALOG.map(item=>item.id).sort();

for(const batch of [1,2])test(`DM imports batch ${batch} as 24 unconfirmed actors while preserving original actors`,()=>{
  const state=seed(),before=structuredClone(state),next=step(state,{batch});
  assert.deepEqual(state,before);assert.equal(next.actors.length,26);
  assert.deepEqual(next.actors.slice(0,2),before.actors);
  const added=next.actors.filter(actor=>!before.actors.some(existing=>existing.id===actor.id));
  assert.deepEqual(added.map(actor=>actor.id).sort(),createClassTestActors({batch}).map(actor=>actor.id).sort());
  assert.equal(added.every(actor=>actor.kind==='pc'&&!actor.confirmed&&actor.classTestProfile?.batch===batch),true);
  const footprints=next.actors.map(actor=>`${actor.position.x}:${actor.position.y??0}:${actor.position.z}`);
  assert.equal(new Set(footprints).size,next.actors.length,'新增角色不得覆盖现有棋子中心');
  for(const actor of added){validateInventory(actor.inventory);assert.ok(actor.inventory.length>0);assert.ok(actor.inventory.every(stack=>stack.quantity>0));}
  const backpackContents=added.map(actor=>JSON.stringify(actor.inventory.map(stack=>[stack.itemId,stack.quantity]).sort()));
  assert.ok(new Set(backpackContents).size>1,'不同测试角色须有不同物品搭配');
  validateInventory(next.partyInventory);
  assert.equal(next.partyInventory.length,182);assert.deepEqual(next.partyInventory.map(stack=>stack.itemId).sort(),catalogIds());
  assert.ok(next.partyInventory.every(stack=>stack.quantity>0));
  assert.equal(next.revision,before.revision+1);assert.equal(next.combat.phase,'preparing');
  assert.equal(next.events.at(-1).type,'add-testing-actors');assert.ok(next.events.at(-1).dmText);
  validateState(next);
});

test('test roster import requires DM and preparing phase without changing rejected state',()=>{
  unchangedAfterFailure(seed(),{batch:1},player,error=>error.status===403);
  const running=upgradeBattle(active(),'test-campaign','test-battle');
  unchangedAfterFailure(running,{batch:1});
  const ended=seed();ended.combat.phase='ended';unchangedAfterFailure(ended,{batch:2});
});

test('test roster command accepts only a valid batch and rejects untrusted extra roster data',()=>{
  for(const payload of [{},{batch:0},{batch:3},{batch:'1'},{batch:null},{batch:1,actors:[]},{batch:2,partyInventory:[]}])unchangedAfterFailure(seed(),payload);
});

test('duplicate presets are rejected independently of capacity and successful import cannot repeat',()=>{
  const collision=seed();collision.actors[0].id=createClassTestActors({batch:1})[0].id;
  unchangedAfterFailure(collision,{batch:1},dm,/重复|已.*存在|已有|导入/);
  const imported=step(seed(),{batch:2});unchangedAfterFailure(imported,{batch:2});
});

test('import rejects exceeding 40 actors atomically instead of importing only a partial class batch',()=>{
  const state=seed();
  for(let index=state.actors.length;index<17;index++){
    const actor=structuredClone(state.actors[1]);actor.id=`existing-${index}`;actor.tiePriority=index;
    actor.position={x:2.5+(index%10)*10,y:0,z:62.5+Math.floor(index/10)*10};state.actors.push(actor);
  }
  validateState(state);unchangedAfterFailure(state,{batch:1},dm,/40|容量|参与者|人数|数量/);
});

test('catalog seeding retains existing team quantities and personal backpacks',()=>{
  const state=seed(),item=ITEM_CATALOG.find(entry=>!entry.chargesPerItem);
  state.partyInventory=[{id:'existing-team-stock',itemId:item.id,quantity:7}];
  state.actors[0].inventory=[{id:'existing-personal-stock',itemId:item.id,quantity:2}];
  const next=step(state,{batch:1});
  assert.deepEqual(next.partyInventory.find(stack=>stack.id==='existing-team-stock'),state.partyInventory[0]);
  assert.deepEqual(next.actors[0].inventory,state.actors[0].inventory);
  assert.deepEqual([...new Set(next.partyInventory.map(stack=>stack.itemId))].sort(),catalogIds());
});

test('undo restores actors and both inventory scopes before the import',()=>{
  const before=seed();before.partyInventory=[];
  const imported=step(before,{batch:2});
  const undone=executeAction(imported,command(imported,'undo'),dm,{draw:noRoll});
  assert.deepEqual(undone.actors,before.actors);assert.deepEqual(undone.partyInventory,before.partyInventory);assert.deepEqual(undone.combat,before.combat);
  assert.equal(undone.revision,imported.revision+1);validateState(undone);
});
