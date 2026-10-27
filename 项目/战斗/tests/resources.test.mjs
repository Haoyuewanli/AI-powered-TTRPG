import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAction, projectState, applyDamage, validateState} from '../src/rules.mjs';
import {normalizeResources,resourceView} from '../src/resources.mjs';
import {fixture,active,command,dm,player} from './fixture.mjs';
const pool = (id='wild',kind='pool') => ({id,name:id,kind,current:2,max:2,recovery:{short:1,long:'all'},source:'合成测试：2024已核对',...(kind==='slots'||kind==='pact'?{level:1}:{})});
test('legacy normalization keeps free text and stable temporary HP baseline',()=>{
  const s=fixture();s.actors[0].tempHp=8;normalizeResources(s);const a=s.actors[0];applyDamage(a,[{type:'force',amount:3}]);assert.equal(a.tempHp,5);assert.equal(a.tempHpBase,8);assert.equal(a.resources,'无额外资源');assert.deepEqual(a.resourcePools,[]);
});
test('combined resource costs are atomic, replay protected, and undo restores all',()=>{
  const s=normalizeResources(active());s.formatVersion=2;s.battleId='b';s.objects=[];s.diceMode='program';s.undoStack=[];s.actors[0].resourcePools=[pool()];
  assert.throws(()=>executeAction(s,command(s,'spend-resources',{actorId:'pc-001',reason:'测试组合',costs:[{resourceId:'bonus',amount:1},{resourceId:'wild',amount:3}]}),dm),/不足/);assert.equal(s.actors[0].economy.bonusUsed,false);
  const c=command(s,'spend-resources',{actorId:'pc-001',reason:'测试组合',costs:[{resourceId:'bonus',amount:1},{resourceId:'wild',amount:1}]});const n=executeAction(s,c,dm);assert.equal(n.actors[0].resourcePools[0].current,1);assert.equal(n.actors[0].economy.bonusUsed,true);assert.throws(()=>executeAction(n,c,dm),/已执行/);assert.deepEqual(executeAction(n,command(n,'undo'),dm).actors,s.actors);
});
test('reaction resets only on owner turn; slot expenditure limit resets each turn',()=>{
  let s=normalizeResources(active());s.actors[0].resourcePools=[pool('slots','slots'),pool('pact','pact')];
  const spend=costs=>{s=executeAction(s,command(s,'spend-resources',{actorId:'pc-001',reason:'规则检查',costs}),dm);};
  spend([{resourceId:'reaction',amount:1},{resourceId:'slots',amount:1}]);assert.throws(()=>spend([{resourceId:'pact',amount:1}]),/每回合/);
  s=executeAction(s,command(s,'next'),dm);assert.equal(s.actors[0].economy.reactionUsed,true);assert.equal(s.actors[1].economy.reactionUsed,false);
  assert.throws(()=>spend([{resourceId:'reaction',amount:1}]),/反应已使用/);
  s=executeAction(s,command(s,'next'),dm);assert.equal(s.actors[0].economy.reactionUsed,false);spend([{resourceId:'pact',amount:1}]);
});
test('rest only restores configured amount and never runs during combat',()=>{
  let s=normalizeResources(active());s.actors[0].resourcePools=[{...pool(),current:0}];assert.throws(()=>executeAction(s,command(s,'rest',{actorId:'pc-001',kind:'short',reason:'短休完成'}),dm),/结束战斗/);s.combat.phase='ended';s=executeAction(s,command(s,'rest',{actorId:'pc-001',kind:'short',reason:'短休完成'}),dm);assert.equal(s.actors[0].resourcePools[0].current,1);assert.throws(()=>executeAction(s,command(s,'rest',{actorId:'pc-001',kind:'long',reason:'长休完成'}),player),/DM权限/);
});
test('player projections never expose enemy pools and reject invalid saved counters',()=>{
  const s=normalizeResources(active());s.actors[1].resourcePools=[pool()];const p=projectState(s,player);assert.equal(p.actors[1].resourcePools,undefined);assert.deepEqual(p.actors[0].resourcePools,[]);s.actors[1].resourcePools[0].current=3;assert.throws(()=>validateState(s),/上限/);
});
test('waiting turn is distinct from spent resources; receipts preserve actual use until owner starts',()=>{
  const preparing=normalizeResources(fixture());assert.equal(resourceView(preparing,preparing.actors[0]).find(r=>r.id==='action').current,1);
  let s=normalizeResources(active());s=executeAction(s,command(s,'dash',{actorId:'pc-001'}),player);s.combat.moved=10;s=executeAction(s,command(s,'next'),dm);
  let views=resourceView(s,s.actors[0]);assert.equal(views.find(r=>r.id==='action').current,0);assert.equal(views.find(r=>r.id==='bonus').current,1);assert.equal(views.find(r=>r.id==='movement').current,50);assert.equal(resourceView(s,s.actors[1]).find(r=>r.id==='action').current,1);
  assert.equal(projectState(s,{role:'player',id:'other'}).combat.turnHistory['pc-001'],undefined);s=executeAction(s,command(s,'next'),dm);views=resourceView(s,s.actors[0]);assert.equal(views.find(r=>r.id==='action').current,1);assert.equal(views.find(r=>r.id==='movement').current,30);
});
