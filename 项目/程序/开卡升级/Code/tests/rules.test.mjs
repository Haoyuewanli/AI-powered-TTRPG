import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary, spellCapacity, classProgression } from '../library.mjs';
import { evaluate } from '../rules.mjs';
import { equipmentCatalog, startOptions } from '../equipment.mjs';
import { druid, basicCharacter } from './fixtures.mjs';
const lib=await loadLibrary();

test('32-point buy prices 16 at 12 and identifies out-of-range ability scores separately',()=>{
  const answers={...druid(lib,1),属性方式:'购点',基础属性:'8、14、13、16、10、13'};
  const check=(scores,config)=>evaluate(lib,{...answers,基础属性:scores},{config}).issues.filter(e=>e.key==='基础属性');
  assert.match(check(answers.基础属性,{}).at(0).message,/智力 16/);
  const expanded={pointBuy32:true};
  assert.equal(check(answers.基础属性,expanded).length,0);
  assert.equal(check('9、14、13、16、10、13',expanded).length,0);
  assert.match(check('10、14、13、16、10、13',expanded).at(0).message,/预算32点，当前花费33点/);
  assert.match(check('8、14、13、17、10、13',expanded).at(0).message,/智力 17/);
});

test('a new skill or class spell cannot reuse an automatic grant in its candidate range',()=>{
  const a={...druid(lib,1),职业技能:'自然、宗教',准备法术:'动物交谈、纠缠术'};
  const r=evaluate(lib,a);
  for(const [key,name,source] of [['职业技能','自然','农民'],['准备法术','动物交谈','德鲁伊语']]){
    const question=r.questions.find(q=>q.key===key);
    assert.ok(!question.options.includes(name));
    assert.ok(question.excluded.some(x=>x.name===name&&x.reason.includes(source)));
    assert.ok(r.issues.some(e=>e.key===key&&e.message.includes('不能选'+name)&&e.message.includes(source)));
  }
});

test('only the standard array requires distinct base scores, and budget and recorded dice still apply',()=>{
  const answers=druid(lib,1);
  const issues=(method,scores,rolls)=>evaluate(lib,{...answers,属性方式:method,基础属性:scores},{rolls}).issues.filter(e=>e.key==='基础属性');
  assert.equal(issues('标准数组','15、14、13、12、10、8').length,0);
  assert.match(issues('标准数组','15、15、13、12、10、8')[0].message,/各一次/);
  assert.equal(issues('购点','15、15、15、8、8、8').length,0);
  assert.match(issues('购点','15、15、15、9、8、8')[0].message,/27点/);
  assert.match(issues('购点','16、8、8、8、8、8')[0].message,/8至15/);
  const rolls={abilities:[15,15,13,12,10,8]};
  assert.equal(issues('程序掷骰','8、15、13、15、12、10',rolls).length,0);
  assert.match(issues('程序掷骰','8、15、13、13、12、10',rolls)[0].message,/已保存/);
  assert.match(issues('程序掷骰','8、15、13、15、12、10')[0].message,/先运行/);
});

test('optional free background bonuses accept any ability but require three points across at least two abilities',()=>{
  const answers=druid(lib,1),config={freeBackgroundAbilities:true};
  const check=(bonus,context={config})=>evaluate(lib,{...answers,背景加值:bonus},context);
  const errors=result=>result.issues.filter(e=>e.key==='背景加值');
  assert.ok(errors(check('魅力、魅力、智力',{})).length);
  const result=check('魅力、魅力、智力');
  assert.equal(errors(result).length,0);
  assert.equal(result.snapshot.scores.魅力,12);
  assert.equal(result.snapshot.scores.智力,13);
  assert.equal(errors(check('力量、敏捷、魅力')).length,0);
  for(const bonus of ['魅力、魅力、魅力','魅力、智力','魅力、智力、力量、敏捷','无'])assert.ok(errors(check(bonus)).length,bonus);
});

test('all 12 classes have distinct rows for 1–20, including source Wizard row repair',()=>{
  assert.equal(lib.classes.length,12);assert.equal(lib.subclasses.length,48);
  for(const c of lib.classes)for(let n=1;n<=20;n++){assert.equal(classProgression(c,n).row[0],String(n));const cap=spellCapacity(c,n);assert.ok(cap.slots.every(v=>Number.isInteger(v)&&v>=0));}
  assert.equal(spellCapacity(lib.find('classes','法师'),4).prepared,7);
  assert.deepEqual(spellCapacity(lib.find('classes','德鲁伊'),12).slots,[4,3,3,3,2,1,0,0,0]);
  assert.deepEqual(spellCapacity(lib.find('classes','魔契师'),12).slots,[0,0,0,0,3,0,0,0,0]);
});
test('12th level Moon Druid computes HP, retroactive Constitution, origin feat, spell grants and gear',()=>{
  const r=evaluate(lib,druid(lib));assert.deepEqual(r.issues,[]);assert.deepEqual(r.missing,[]);
  assert.equal(r.snapshot.hpMax,135);assert.equal(r.snapshot.ac,15);assert.equal(r.snapshot.spellcasting.dc,17);
  assert.equal(r.snapshot.cantrips.length,5);assert.equal(r.snapshot.prepared.length,16);
  assert.equal(r.snapshot.grantedSpells.length,7);assert.equal(r.snapshot.equipment.gold,39);
  assert.equal(r.snapshot.equipment.owned.长棍,1);
  assert.equal(r.snapshot.skills.自然,10);assert.equal(r.snapshot.savingThrows.感知,9);
});
test('1st level creation does not request subclass, feats or wild forms',()=>{
  const r=evaluate(lib,druid(lib,1));assert.deepEqual(r.issues,[]);assert.deepEqual(r.missing,[]);
  assert.equal(r.snapshot.hpMax,13);assert.equal(r.snapshot.cantrips.length,3);assert.equal(r.snapshot.prepared.length,4);
  assert.ok(!r.questions.some(q=>['子职','野兽形态','4级专长'].includes(q.key)));
});
test('earlier feat prerequisites cannot borrow later ability gains',()=>{
  const a=druid(lib);a['4级专长']='巨武器大师';a['4级专长加值']='力量';a['8级专长加值']='力量、力量';a['12级专长加值']='力量、力量';
  const r=evaluate(lib,a);assert.equal(r.snapshot.scores.力量,13);assert.ok(r.issues.some(e=>e.key==='4级专长'&&e.message.includes('13+')));
});
test('background limits, point-buy and upper bounds reject invalid mechanical inputs',()=>{
  const a=druid(lib);a.背景加值='魅力、魅力、体质';assert.ok(evaluate(lib,a).issues.some(e=>e.key==='背景加值'));
  a.属性方式='购点';a.基础属性='15、15、15、15、15、15';assert.ok(evaluate(lib,a).issues.some(e=>e.message.includes('27')));
});
test('duplicate spells and absent or over-budget equipment cannot complete',()=>{
  const a=druid(lib);a.职业戏法='神导术、神导术、神导术、神导术、神导术';a.购买物品='板甲*1';a.穿戴护甲='半身板甲';
  const r=evaluate(lib,a);assert.ok(r.issues.some(e=>e.key==='职业戏法'));assert.ok(r.issues.some(e=>e.message.includes('资金不足')));assert.ok(r.issues.some(e=>e.message.includes('没有持有')));
});
test('shape restrictions depend on level and subclass; CR4 elephant is Moon-only at 12',()=>{
  const a=druid(lib);let r=evaluate(lib,a);assert.ok(r.questions.find(q=>q.key==='野兽形态').options.includes('象'));
  a.子职='海洋结社';r=evaluate(lib,a);assert.ok(!r.questions.find(q=>q.key==='野兽形态').options.includes('象'));
  r=evaluate(lib,druid(lib,4));assert.ok(!r.questions.find(q=>q.key==='野兽形态').options.includes('猫头鹰'));
});
test('full feat list preserves future candidates for expert planning',()=>{
  const r=evaluate(lib,druid(lib));assert.ok(r.questions.find(q=>q.key==='4级专长').options.includes('巨武器大师'));
});
test('numeric answers use the exact question option order and tolerate full-width input',()=>{
  const a=druid(lib);a.原初职能='１';a.基础属性='８，１４，１３，１２，１５，１０';const r=evaluate(lib,a);assert.deepEqual(r.issues,[]);assert.equal(r.canonical.原初职能,'术师');
});
test('all 48 subclass branches can construct a questionnaire without exceptions or missing spell grants',()=>{
  for(const sub of lib.subclasses){const c=lib.classes.find(c=>c.className===sub.className);const a={...druid(lib),职业:c.name,子职:sub.name};
    const r=evaluate(lib,a);assert.ok(!r.issues.some(e=>e.message.includes('条目缺失')),sub.name+': '+JSON.stringify(r.issues));}
});
test('equipment parses selectable starter bundles and integer currency',()=>{
  assert.deepEqual(Object.keys(startOptions(lib.find('classes','战士').tables[0].rows.at(-1)[1])),['A','B','C']);
  assert.equal(equipmentCatalog(lib).get('板甲').priceCp,150000);
});
test('all 12 classes complete representative builds at levels 1, 12 and 20',()=>{
  for(const c of lib.classes)for(const level of [1,12,20]){
    const {result}=basicCharacter(lib,c.name,level);
    assert.deepEqual(result.missing,[],c.name+' '+level);assert.deepEqual(result.issues,[],c.name+' '+level);
    assert.ok(Number.isFinite(result.snapshot.hpMax)&&result.snapshot.hpMax>0);
  }
});
test('untrained shields do not grant armor class in 2024',()=>{
  const {answers}=basicCharacter(lib,'法师',1);answers.购买物品='盾牌*1';answers.使用盾牌='是';
  const r=evaluate(lib,answers);assert.deepEqual(r.issues,[]);assert.equal(r.snapshot.ac,12);assert.ok(r.snapshot.equipment.notes.some(n=>n.includes('不能获得盾牌')));
});
test('unrecognized weapon input reports an error instead of crashing',()=>{
  const a=druid(lib);a.常用武器='不存在的武器';const r=evaluate(lib,a);assert.ok(r.issues.some(e=>e.key==='常用武器'));
});
