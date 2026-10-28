import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as operations from '../src/operations.mjs';
import * as compatible from '../src/rules.mjs';
import {openStore} from '../src/store.mjs';
import {upgradeBattle} from '../src/workspace.mjs';
import {active,command,dm,player} from './fixture.mjs';

const noRandom=()=>{throw new Error('人工记录不应调用程序随机数');};
const initial=()=>{
  const state=upgradeBattle(active(),'test-campaign','test-battle');
  state.actors[0].resourcePools=[{id:'slot-1',name:'一环位',kind:'slots',level:1,current:2,max:2,recovery:{long:'all'},source:'2024合成测试'}];
  state.actors[1].resourcePools=[{id:'target-pool',name:'目标资源',kind:'pool',current:4,max:4,recovery:{},source:'2024合成测试'}];
  return state;
};
const payload=(patch={})=>({actorId:'pc-001',targetId:'npc-001',label:'主持手记',note:'主持在外部工具中核对了结果',...patch});
const execute=(state,type,p,options)=>operations.executeAction(state,command(state,type,p),dm,options);

test('legacy rules imports resolve to the same centralized operations and dice functions',()=>{
  for(const name of ['executeAction','parseDice','rollDice','rollDamage','rollD20','validateState','projectState','handoff'])assert.equal(compatible[name],operations[name]);
});
test('external final temporary HP keeps grant baseline and is never damaged twice',()=>{
  const state=initial();state.actors[1].tempHp=6;state.actors[1].tempHpBase=8;
  const next=execute(state,'manual-record',payload({mode:'apply',application:{finalHp:30,finalTempHp:2}}),{draw:noRandom});
  assert.equal(next.actors[1].hp,30);assert.equal(next.actors[1].tempHp,2);assert.equal(next.actors[1].tempHpBase,8);
  assert.throws(()=>execute(state,'manual-record',payload({mode:'apply',application:{finalTempHp:2,damage:[{type:'fire',amount:4}]}})),/不能/);
});

test('general dice keep signed totals and every manual origin bypasses RNG',()=>{
  for(const origin of operations.MANUAL_ROLL_ORIGINS){
    const result=operations.rollDice('2d6-9',{values:[1,2],origin,draw:noRandom});
    assert.equal(result.total,-6);assert.equal(result.source,'manual');assert.equal(result.origin,origin);assert.deepEqual(result.values,[1,2]);
  }
  const result=operations.rollDice('2d6+3',{draw:()=>4});assert.equal(result.total,11);assert.equal(result.source,'program');assert.equal(result.origin,'program');
  assert.equal(operations.rollDamage('1d6-9',false,noRandom,[1]).total,0);
});

test('general dice validate raw faces, counts, source claims and d20 advantage',()=>{
  const r=operations.rollDice('1d20-10',{mode:'advantage',values:[3,18],origin:'external-tool',draw:noRandom});assert.equal(r.natural,18);assert.equal(r.total,8);
  assert.equal(operations.rollDice('1d20-10',{mode:'disadvantage',values:[3,18],origin:'external-tool',draw:noRandom}).total,-7);
  for(const [formula,options] of [
    ['1d6',{values:[0],origin:'physical-dice'}],['1d6',{values:[7],origin:'physical-dice'}],['2d6',{values:[4],origin:'physical-dice'}],
    ['1d20',{mode:'advantage',values:[18],origin:'physical-dice'}],['1d6',{mode:'advantage',values:[4,5],origin:'physical-dice'}],
    ['2d20',{mode:'disadvantage',values:[4,5],origin:'physical-dice'}],['1d20',{values:[18],origin:'program'}],['1d20',{values:[18]}],
    ['1d20',{origin:'external-tool'}],['0d20',{}],['1d3',{}]
  ])assert.throws(()=>operations.rollDice(formula,{...options,draw:noRandom}));
  assert.throws(()=>operations.rollDice('1d4',{draw:()=>5}),/程序d4/);
});

test('generic roll command records program or supplied dice without consuming a turn resource',()=>{
  const s=initial(),n=execute(s,'roll-dice',{actorId:'pc-001',label:'研究检定',formula:'1d20+5'},{draw:()=>14});
  assert.deepEqual(n.actors,s.actors);assert.deepEqual(n.combat,s.combat);assert.equal(n.events.at(-1).rolls[0].total,19);assert.equal(n.events.at(-1).rolls[0].source,'program');assert.equal(n.events.at(-1).diceRecord.actorId,'pc-001');
  const m=execute(n,'roll-dice',{label:'外部伤害骰',formula:'2d6+1',values:[2,3],origin:'external-tool'},{draw:noRandom});assert.equal(m.events.at(-1).rolls[0].total,6);assert.equal(m.events.at(-1).rolls[0].source,'manual');
  s.diceMode='physical';assert.throws(()=>execute(s,'roll-dice',{label:'检定',formula:'1d20'},{draw:noRandom}),/线下骰/);
  assert.equal(execute(s,'roll-dice',{label:'实体骰',formula:'1d20',values:[11],origin:'physical-dice'},{draw:noRandom}).events.at(-1).rolls[0].total,11);
});

test('manual record defaults to record-only, preserves domain state and audits original dice',()=>{
  const s=initial(),n=execute(s,'manual-record',payload({operationId:'custom:external-operation',finalResult:'检查通过，外部已记录费用',rolls:[{formula:'1d20+3',values:[17],origin:'external-tool'},{formula:'2d6-9',values:[1,2],origin:'dm-recorded'}]}),{draw:noRandom});
  for(const key of ['actors','board','combat','objects','title','diceMode'])assert.deepEqual(n[key],s[key]);
  assert.equal(n.revision,1);assert.equal(n.undoStack.length,1);const event=n.events.at(-1);assert.equal(event.manualRecord.mode,'record-only');assert.equal(event.manualRecord.applied,false);assert.equal(event.manualRecord.application,null);assert.equal(event.manualRecord.outcome,null);assert.equal(event.manualRecord.finalResult,'检查通过，外部已记录费用');assert.deepEqual(event.rolls.map(r=>r.total),[20,-6]);assert.deepEqual(event.rolls[0].values,[17]);
});

test('record-only rejects nonempty applications and invented raw-dice totals',()=>{
  const s=initial();
  assert.throws(()=>execute(s,'manual-record',payload({application:{costs:[{resourceId:'action',amount:1}]}}),{draw:noRandom}),/仅记录/);
  assert.throws(()=>execute(s,'manual-record',payload({rolls:[{formula:'1d20',values:[15],origin:'external-tool',total:99}]}),{draw:noRandom}),/字段/);
  assert.throws(()=>execute(s,'manual-record',payload({rolls:[{formula:'1d20',origin:'external-tool'}]}),{draw:noRandom}),/原始骰点/);
  assert.throws(()=>execute(s,'manual-record',payload({rolls:[{formula:'1d20',values:[21],origin:'external-tool'}]}),{draw:noRandom}),/d20/);
  assert.equal(s.revision,0);assert.equal(s.events.length,0);assert.equal(s.combat.action,'none');
});

test('apply uses raw typed damage once, while finalHp directly records the adjudicated HP',()=>{
  const s=initial();s.actors[1].resistances=['fire'];s.actors[1].tempHp=3;s.actors[1].tempHpBase=3;
  const n=execute(s,'manual-record',payload({mode:'apply',application:{damage:[{type:'fire',amount:9}]}}),{draw:noRandom});assert.equal(n.actors[1].hp,39);assert.equal(n.actors[1].tempHp,0);assert.equal(n.events.at(-1).manualRecord.outcome.damage.total,4);assert.equal(n.events.at(-1).manualRecord.outcome.damage.absorbed,3);assert.equal(n.events.at(-1).manualRecord.damageConvention,'raw-before-defenses');
  const m=execute(s,'manual-record',payload({mode:'apply',application:{finalHp:30}}),{draw:noRandom});assert.equal(m.actors[1].hp,30);assert.equal(m.actors[1].tempHp,3);assert.equal(m.events.at(-1).manualRecord.finalHpConvention,'direct-final-hp');
  for(const conflicting of [{finalHp:30,heal:1},{finalHp:30,damage:[{type:'fire',amount:1}]}])assert.throws(()=>execute(s,'manual-record',payload({mode:'apply',application:conflicting}),{draw:noRandom}),/最终HP/);
});

test('apply caps healing and treats temporaryHp as a grant, with explicit replacement',()=>{
  const s=initial();s.actors[1].hp=38;s.actors[1].tempHp=5;s.actors[1].tempHpBase=8;
  const n=execute(s,'manual-record',payload({mode:'apply',application:{heal:20,temporaryHp:3}}),{draw:noRandom});assert.equal(n.actors[1].hp,40);assert.equal(n.actors[1].tempHp,5);assert.equal(n.actors[1].tempHpBase,8);
  const m=execute(s,'manual-record',payload({mode:'apply',application:{temporaryHp:3,replaceTemporaryHp:true}}),{draw:noRandom});assert.equal(m.actors[1].tempHp,3);assert.equal(m.actors[1].tempHpBase,3);
  assert.throws(()=>execute(s,'manual-record',payload({mode:'apply',application:{replaceTemporaryHp:true}}),{draw:noRandom}),/数值结果|临时生命/);
});

test('manual application charges only the acting character and records before/after resource state',()=>{
  const s=initial();s.actors[1].hp=20;
  const n=execute(s,'manual-record',payload({mode:'apply',application:{heal:7,costs:[{resourceId:'action',amount:1},{resourceId:'slot-1',amount:1}]}}),{draw:noRandom});
  assert.equal(n.actors[1].hp,27);assert.equal(n.actors[0].resourcePools[0].current,1);assert.equal(n.actors[1].resourcePools[0].current,4);assert.equal(n.combat.action,'manual');assert.deepEqual(n.combat.slotSpentBy,['pc-001']);
  const audit=n.events.at(-1).manualRecord;assert.equal(audit.applied,true);assert.equal(audit.outcome.before.payer.actorId,'pc-001');assert.equal(audit.outcome.before.payer.resourcePools[0].current,2);assert.equal(audit.outcome.after.payer.resourcePools[0].current,1);assert.equal(audit.outcome.before.target.hp,20);assert.equal(audit.outcome.after.target.hp,27);
});

test('invalid cost or outcome rejects the entire manual application',()=>{
  const s=initial(),original=structuredClone(s);
  for(const application of [{heal:7,costs:[{resourceId:'bonus',amount:1},{resourceId:'slot-1',amount:3}]},{finalHp:41,costs:[{resourceId:'action',amount:1}]},{heal:-1,costs:[{resourceId:'slot-1',amount:1}]},{damage:[{type:'wrong',amount:2}]},{damage:[null]},{costs:[null]},{resourceAdjustments:{'slot-1':2}},{heal:1,replaceTemporaryHp:true}]){
    assert.throws(()=>execute(s,'manual-record',payload({mode:'apply',application}),{draw:noRandom}));assert.deepEqual(s,original);
  }
  assert.throws(()=>execute(s,'manual-record',{mode:'apply',label:'无目标',note:'需要目标',application:{heal:2}},{draw:noRandom}),/目标/);
  assert.throws(()=>execute(s,'manual-record',{mode:'apply',targetId:'npc-001',label:'无行动者',note:'需要费用付款人',application:{heal:2,costs:[{resourceId:'target-pool',amount:1}]}},{draw:noRandom}),/行动者/);
});

test('manual record and generic dice enforce permission, context, lengths and replay protection',()=>{
  const s=initial();
  for(const [type,p] of [['manual-record',payload()],['roll-dice',{label:'检定',formula:'1d20',values:[8],origin:'dm-recorded'}]]){
    assert.throws(()=>operations.executeAction(s,command(s,type,p),player,{draw:noRandom}),/DM权限/);
    assert.throws(()=>operations.executeAction(s,{...command(s,type,p),battleId:'elsewhere'},dm,{draw:noRandom}),/其他战斗/);
    assert.throws(()=>execute(s,type,{...p,label:'x'.repeat(81)},{draw:noRandom}),/名称/);
  }
  for(const patch of [{note:'x'},{note:'x'.repeat(4001)},{publicNote:'x'.repeat(2001)},{finalResult:'x'.repeat(2001)},{rolls:Array(21).fill({formula:'1d20',values:[8],origin:'dm-recorded'})},{mode:'wrong'},{application:[]}])assert.throws(()=>execute(s,'manual-record',payload(patch),{draw:noRandom}));
  const c=command(s,'manual-record',payload({mode:'apply',application:{finalHp:25}})),n=operations.executeAction(s,c,dm,{draw:noRandom});assert.throws(()=>operations.executeAction(n,c,dm,{draw:noRandom}),/已执行/);assert.throws(()=>operations.executeAction(n,command(s,'manual-record',payload()),dm,{draw:noRandom}),/进度已变化/);
});

test('undo restores the manual application but retains original dice and record provenance',()=>{
  const s=initial(),p=payload({mode:'apply',application:{finalHp:25,costs:[{resourceId:'bonus',amount:1}]},rolls:[{formula:'1d20',values:[17],origin:'physical-dice'}]});
  const c=command(s,'manual-record',p),n=operations.executeAction(s,c,dm,{draw:noRandom}),u=execute(n,'undo',{});
  assert.deepEqual(u.actors,s.actors);assert.deepEqual(u.combat,s.combat);assert.equal(u.events[0].rolls[0].origin,'physical-dice');assert.deepEqual(u.events[0].rolls[0].values,[17]);assert.equal(u.events[0].manualRecord.applied,true);assert.ok(u.events[0].undoneBy);assert.throws(()=>operations.executeAction(u,c,dm),/已执行/);
});

test('private manual record, dice and final outcomes are absent from player state and handoff',()=>{
  const s=initial(),n=execute(s,'manual-record',payload({note:'私密说明secret-manual-note',finalResult:'私密结果secret-manual-result',publicNote:'主持已记录公开结果',rolls:[{formula:'1d20',values:[17],origin:'external-tool'}]}),{draw:noRandom});
  const projected=operations.projectState(n,player),event=projected.events.at(-1);assert.equal(event.text,'主持已记录公开结果');assert.equal(event.rolls,undefined);assert.equal(event.manualRecord,undefined);assert.equal(JSON.stringify(projected).includes('secret-manual'),false);
  assert.equal(JSON.stringify(operations.handoff(n,player)).includes('secret-manual'),false);assert.equal(operations.projectState(n,dm).events.at(-1).manualRecord.note,'私密说明secret-manual-note');
  assert.ok(operations.handoff(n,dm).actions['manual-record']);assert.ok(operations.handoff(n,dm).actions['roll-dice']);
});

test('manual records persist once through the existing store and survive reopening',async()=>{
  const output=fileURLToPath(new URL('../../../../开发记录/临时/人工记录检查/',import.meta.url));await mkdir(output,{recursive:true});const dir=await mkdtemp(join(output,'store-'));let store=await openStore(dir,initial);
  try{
    await store.dispatch(command(store.state,'manual-record',payload({mode:'apply',application:{finalHp:19,costs:[{resourceId:'bonus',amount:1}]},rolls:[{formula:'2d6+2',values:[3,4],origin:'external-tool'}]})),dm,{draw:noRandom});
    const before=await readFile(store.path);await store.close();store=await openStore(dir,()=>{throw new Error('不得重建');});assert.deepEqual(await readFile(store.path),before);assert.equal(store.state.events.length,1);assert.equal(store.state.events[0].rolls[0].total,9);assert.equal(store.state.events[0].manualRecord.outcome.after.target.hp,19);assert.equal(store.state.actors[0].economy.bonusUsed,true);
  }finally{await store.close();}
});
