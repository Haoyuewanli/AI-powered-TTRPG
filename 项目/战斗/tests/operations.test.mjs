import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAction,validateState,handoff} from '../src/rules.mjs';
import {actionCatalog,operationProblem} from '../src/action-catalog.mjs';
import {normalizeResources} from '../src/resources.mjs';
import {active,command,dm,player} from './fixture.mjs';
const initial=()=>{const s=normalizeResources(active());s.actors[0].resourcePools=[{id:'slot-1',name:'一环',kind:'slots',current:4,max:4,level:1,source:'PHB2024 合成测试',recovery:{long:'all'}}];s.actors[0].operations=[{id:'heal',name:'合成治疗',category:'spells',ruleset:'2024',source:'合成测试：主持核对效果',notes:'动作+一环位，治疗由主持确定',target:true,spellLevel:1,slotMode:'expend',costs:[{resourceId:'action',amount:1}]}];return s;};
test('unified operation API delegates weapons and dash to existing mechanical engine',()=>{
  const s=initial();const n=executeAction(s,command(s,'use-operation',{actorId:'pc-001',operationId:'weapon:sword',targetId:'npc-001'}),player,{draw:()=>10});assert.equal(n.actors[1].hp,27);assert.equal(n.combat.attacksUsed,1);assert.equal(executeAction(s,command(s,'use-operation',{actorId:'pc-001',operationId:'common:dash'}),player).combat.action,'dash');
});
test('manual spell resolves costs and effect atomically with explicit slot choice',()=>{
  const s=initial();s.actors[1].hp=20;const p={actorId:'pc-001',operationId:'custom:heal',targetId:'npc-001',slotId:'slot-1',reason:'核对施法和结果',result:{heal:7}};
  assert.throws(()=>executeAction(s,command(s,'use-operation',p),player),/DM权限/);assert.throws(()=>executeAction(s,command(s,'use-operation',{...p,result:{heal:-1}}),dm),/治疗/);assert.equal(s.actors[0].resourcePools[0].current,4);assert.equal(s.combat.action,'none');
  const n=executeAction(s,command(s,'use-operation',p),dm);assert.equal(n.actors[1].hp,27);assert.equal(n.actors[0].resourcePools[0].current,3);assert.equal(n.combat.action,'manual');
  assert.throws(()=>executeAction(s,command(s,'use-operation',{...p,slotId:'missing'}),dm),/法术位/);
});
test('2024 shove spends one attack, leaves extra attack; jump never spends bonus action',()=>{
  const s=initial();s.actors[0].attackLimit=2;
  const n=executeAction(s,command(s,'use-operation',{actorId:'pc-001',operationId:'common:shove',targetId:'npc-001',reason:'力量豁免成功，无位移'}),dm);assert.equal(n.combat.attacksUsed,1);assert.equal(n.actors[0].economy.bonusUsed,false);
  assert.equal(executeAction(n,command(n,'attack',{actorId:'pc-001',targetId:'npc-001',attackId:'sword'}),dm,{draw:()=>1}).combat.attacksUsed,2);
  const j=executeAction(s,command(s,'use-operation',{actorId:'pc-001',operationId:'common:jump',movementCost:10,reason:'核对助跑与跳远距离'}),dm);assert.equal(j.combat.moved,10);assert.equal(j.combat.action,'none');assert.equal(j.actors[0].economy.bonusUsed,false);
  assert.throws(()=>executeAction(s,command(s,'use-operation',{actorId:'pc-001',operationId:'common:dip',reason:'蘸火'}),dm),/物品|用途/);
});
test('catalog, validation and handoff share stable operation definitions without enemy leakage',()=>{
  const s=initial(),o=actionCatalog(s.actors[0]).find(o=>o.id==='custom:heal');assert.equal(operationProblem(s,s.actors[0],o),'');s.actors[0].resourcePools[0].current=0;assert.match(operationProblem(s,s.actors[0],o),/不足/);const packet=handoff(s,player);assert.equal(packet.operationCatalog.length,1);assert.equal(packet.operationCatalog[0].operations.some(o=>o.id==='common:study'),true);s.actors[0].operations[0].costs.push({resourceId:'unknown',amount:1});assert.throws(()=>validateState(s),/不存在/);
});
test('registered weapon ammunition costs settle on a miss, and invalid rolls never spend',()=>{
  const s=initial();s.actors[0].resourcePools.push({id:'ammo',name:'投掷库存',kind:'inventory',current:1,max:1,recovery:{},source:'合成：2024物品库存'});s.actors[0].attacks[0].costs=[{resourceId:'ammo',amount:1}];
  const payload={actorId:'pc-001',targetId:'npc-001',attackId:'sword',manualRolls:{attack:[0]}};assert.throws(()=>executeAction(s,command(s,'attack',payload),player),/d20/);assert.equal(s.actors[0].resourcePools[1].current,1);
  const n=executeAction(s,command(s,'attack',{...payload,manualRolls:{attack:[1]}}),player);assert.equal(n.actors[0].resourcePools[1].current,0);assert.equal(n.actors[1].hp,40);
  n.combat.action='none';n.combat.attacksUsed=0;assert.match(operationProblem(n,n.actors[0],actionCatalog(n.actors[0]).find(o=>o.id==='weapon:sword')),/不足/);assert.throws(()=>executeAction(n,command(n,'attack',{...payload,manualRolls:{attack:[1]}}),player),/不足/);
});
