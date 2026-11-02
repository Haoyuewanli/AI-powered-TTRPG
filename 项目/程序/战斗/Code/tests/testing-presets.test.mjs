import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassTestActors,CLASS_TEST_PRESET_MATRIX} from '../src/testing-presets.mjs';
import {validateActor,validateState} from '../src/rules.mjs';
import {fixture} from './fixture.mjs';
import {access} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const all=()=>[...createClassTestActors({batch:1}),...createClassTestActors({batch:2})];
const actor=(id,sub)=>all().find(a=>a.classTestProfile.classId===id&&(!sub||a.classTestProfile.subclassId===sub));
const resource=(a,id)=>a.resourcePools.find(p=>p.id===id);
const ordinary=a=>a.resourcePools.filter(p=>p.kind==='slots').map(p=>p.max);

test('two batches cover exactly the twelve PHB2024 classes and 48 distinct subclasses',()=>{
  const first=createClassTestActors({batch:1}),second=createClassTestActors({batch:2}),actors=[...first,...second];
  assert.equal(first.length,24);assert.equal(second.length,24);assert.equal(new Set(actors.map(a=>a.id)).size,48);assert.equal(new Set(actors.map(a=>a.ownerId)).size,48);
  assert.deepEqual([...new Set(first.map(a=>a.classTestProfile.classId))],['barbarian','bard','cleric','druid','fighter','monk']);
  assert.deepEqual([...new Set(second.map(a=>a.classTestProfile.classId))],['paladin','ranger','rogue','sorcerer','warlock','wizard']);
  assert.equal(CLASS_TEST_PRESET_MATRIX.length,12);
  for(const entry of CLASS_TEST_PRESET_MATRIX){assert.equal(entry.subclasses.length,4);assert.equal(actors.filter(a=>a.classTestProfile.classId===entry.classId).length,4);}
});
test('all partial cards validate, stay unconfirmed and provide an explicit source for every resource',()=>{
  const board=fixture().board;
  for(const a of all()){
    validateActor(a,board);assert.equal(a.confirmed,false);assert.equal(a.classTestProfile.level,20);assert.equal(a.kind,'pc');assert.match(a.id,/^test20-/);assert.match(a.ownerId,/^player-test20-/);assert.match(a.notes,/合成资源测试/);assert.ok(a.id.length<=60&&a.ownerId.length<=60);
    assert.equal(a.resourcePools.every(p=>p.source.includes('PHB2024')),true);
    for(const pool of a.resourcePools)assert.equal(a.operations.some(o=>o.costs.some(c=>c.resourceId===pool.id)),true,`${a.id}/${pool.id}`);
    assert.equal(a.operations.every(o=>o.ruleset==='2024'&&o.notes.includes('主持资源核对')),true);
  }
  for(const batch of [1,2]){const state=fixture();state.actors=createClassTestActors({batch});validateState(state);}
});
test('all profile source files exist inside the local PHB2024 reference',async()=>{
  const root=process.env.RPG_REFERENCE_ROOT||fileURLToPath(new URL('../../../../../',import.meta.url));
  for(const a of all())for(const path of a.classTestProfile.sourceFiles){assert.equal(path.startsWith('项目/资源/资料/5E不全书/网页/topics/玩家手册2024/'),true);await access(join(root,path));}
});
test('spell slots distinguish full, half, subclass casters, pact magic and arcanum',()=>{
  for(const cls of ['bard','cleric','druid','sorcerer','wizard'])assert.deepEqual(ordinary(actor(cls)),[4,3,3,3,3,2,2,1,1]);
  for(const cls of ['paladin','ranger'])assert.deepEqual(ordinary(actor(cls)),[4,3,3,3,2]);
  assert.deepEqual(ordinary(actor('fighter','eldritch-knight')),[4,3,3,1]);assert.deepEqual(ordinary(actor('rogue','arcane-trickster')),[4,3,3,1]);
  for(const cls of ['barbarian','monk','warlock'])assert.deepEqual(ordinary(actor(cls)),[]);
  const w=actor('warlock');assert.equal(resource(w,'pact-slots').kind,'pact');assert.equal(resource(w,'pact-slots').max,4);assert.equal(resource(w,'pact-slots').level,5);
  for(const level of [6,7,8,9]){const p=resource(w,`arcanum-${level}`);assert.equal(p.kind,'pool');assert.equal(p.max,1);assert.deepEqual(p.recovery,{long:'all'});}
});
test('level 20 base resources keep finite limits and conditional recovery separate',()=>{
  assert.equal(resource(actor('barbarian'),'rage').max,6);assert.deepEqual(resource(actor('barbarian'),'rage').recovery,{short:1,long:'all'});
  assert.equal(resource(actor('cleric'),'channel-divinity').max,4);assert.deepEqual(resource(actor('cleric'),'divine-intervention').recovery,{});
  assert.equal(resource(actor('druid'),'wild-shape').max,4);assert.equal(resource(actor('druid'),'wild-resurgence').max,1);assert.equal(resource(actor('druid'),'nature-magician').max,1);
  assert.equal(actor('druid').operations.find(o=>o.id==='check-wild-resurgence').costs.some(c=>c.resourceId==='wild-shape'&&c.amount===1),true);
  assert.equal(resource(actor('fighter'),'second-wind').max,4);assert.equal(resource(actor('fighter'),'action-surge').max,2);assert.equal(resource(actor('fighter'),'indomitable').max,3);
  assert.equal(resource(actor('monk'),'focus').max,20);assert.equal(resource(actor('monk'),'uncanny-metabolism').max,1);
  assert.equal(resource(actor('paladin'),'lay-on-hands').max,100);assert.equal(resource(actor('paladin'),'channel-divinity').max,3);
  assert.equal(resource(actor('ranger'),'favored-enemy').max,6);assert.equal(resource(actor('rogue'),'stroke-of-luck').max,1);
  assert.equal(resource(actor('sorcerer'),'sorcery-points').max,20);assert.equal(resource(actor('sorcerer'),'innate-sorcery').max,2);assert.deepEqual(resource(actor('sorcerer'),'sorcerous-restoration').recovery,{long:'all'});
  assert.equal(resource(actor('warlock'),'magical-cunning').max,1);assert.equal(resource(actor('wizard'),'arcane-recovery').max,1);
});
test('subclass dice, attributes and target-dependent resources use their own pools',()=>{
  const battle=resource(actor('fighter','battle-master'),'superiority-dice');assert.equal(battle.max,6);assert.equal(battle.sides,12);
  for(const [cls,sub,id] of [['fighter','psi-warrior','psi-dice'],['rogue','soulknife','soulknife-dice']]){const p=resource(actor(cls,sub),id);assert.equal(p.max,12);assert.equal(p.sides,12);assert.deepEqual(p.recovery,{short:1,long:'all'});}
  assert.equal(resource(actor('barbarian','zealot'),'warrior-of-gods').max,7);assert.equal(resource(actor('warlock','celestial'),'healing-light').max,21);
  assert.equal(actor('monk').classTestProfile.abilities.wis,24);assert.equal(resource(actor('monk','mercy'),'flurry-healing-harm').max,7);
  assert.equal(actor('monk','mercy').operations.find(o=>o.id==='check-hand-ultimate-mercy').costs.some(c=>c.resourceId==='focus'&&c.amount===5),true);
  assert.equal(resource(actor('cleric','light'),'warding-flare').max,5);assert.deepEqual(resource(actor('cleric','light'),'warding-flare').recovery,{short:'all',long:'all'});
  assert.equal(resource(actor('sorcerer','clockwork'),'bastion-law-dice').current,0);assert.deepEqual(resource(actor('sorcerer','clockwork'),'bastion-law-dice').recovery,{});
  assert.equal(resource(actor('fighter','champion'),'heroic-inspiration').current,0);assert.deepEqual(resource(actor('fighter','champion'),'heroic-inspiration').recovery,{});
  assert.equal(resource(actor('rogue','thief'),'attunement-capacity').max,4);assert.deepEqual(resource(actor('rogue','thief'),'attunement-capacity').recovery,{});
});
test('pre-rolled dice are not fabricated and ward/overchannel state is not silently restored',()=>{
  const diviner=resource(actor('wizard','diviner'),'portent');assert.equal(diviner.max,3);assert.equal(diviner.current,0);assert.deepEqual(diviner.values,[]);assert.deepEqual(diviner.recovery,{});
  const abjurer=actor('wizard','abjurer');assert.equal(resource(abjurer,'arcane-ward-hp').max,45);assert.equal(resource(abjurer,'arcane-ward-hp').current,0);assert.equal(abjurer.classTestProfile.manualState.arcaneWardCreated,false);assert.deepEqual(resource(abjurer,'arcane-ward-hp').recovery,{});
  const evoker=actor('wizard','evoker');assert.equal(resource(evoker,'overchannel-free').max,1);assert.equal(evoker.classTestProfile.manualState.overchannelUses,0);assert.equal(evoker.operations.some(o=>o.id==='check-overchannel-again'&&o.costs.length===0),true);
  assert.equal(actor('barbarian','world-tree').classTestProfile.manualState.travelAlongTreeUsedThisRage,false);
  assert.equal(actor('barbarian','zealot').classTestProfile.manualState.fanaticalFocusUsedThisRage,false);
});
test('base attack limits apply subclass extra attack without assigning unrelated subclasses',()=>{
  assert.equal(actor('fighter').attackLimit,4);assert.equal(actor('barbarian').attackLimit,2);assert.equal(actor('monk').attackLimit,2);assert.equal(actor('paladin').attackLimit,2);assert.equal(actor('ranger').attackLimit,2);
  assert.equal(actor('bard','valor').attackLimit,2);assert.equal(actor('bard','lore').attackLimit,1);assert.equal(actor('warlock').attackLimit,1);assert.equal(actor('rogue').attackLimit,1);
  assert.equal(actor('monk').speed,60);assert.equal(actor('barbarian').speed,40);assert.equal(actor('ranger').speed,40);
});
test('returned cards are independent and invalid batch selection does not create a partial result',()=>{
  const a=createClassTestActors({batch:1});a[0].resourcePools[0].current=0;a[0].classTestProfile.abilities.str=1;
  const b=createClassTestActors({batch:1});assert.equal(b[0].resourcePools[0].current,6);assert.equal(b[0].classTestProfile.abilities.str,24);
  for(const batch of [undefined,0,3,'1',null])assert.throws(()=>createClassTestActors({batch}),/批次/);
});
