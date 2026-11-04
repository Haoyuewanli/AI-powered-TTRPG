import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary, info } from '../library.mjs';
import { evaluate } from '../rules.mjs';
import { equipmentCatalog } from '../equipment.mjs';
import { answerText, parseAnswers, renderFiles, spellReferenceName } from '../render.mjs';
import { basicCharacter, druid } from './fixtures.mjs';

const lib=await loadLibrary();
const state=answers=>({id:'render-test',revision:1,mode:'自由',answers,rolls:{},config:{}});

test('answer file includes full spell candidates and calculated equipment training without adding input fields',()=>{
  const {answers,result}=basicCharacter(lib,'法师',1),s=state(answers),text=answerText(s,result,5);
  for(const key of ['职业戏法','1级法术书新增']){
    const q=result.questions.find(q=>q.key===key);assert.ok(q.options.length>16);
    assert.ok(text.includes('# 选择'+q.count+'项。'));
    for(const [i,name] of q.options.entries())assert.ok(text.includes(`${i+1}.${name}`));
    assert.ok(text.includes(spellReferenceName(q)));
  }
  assert.ok(text.includes('# 护甲受训：无；武器熟练：'+result.snapshot.weaponTraining));
  const parsed=parseAnswers(text,'render-test-1');
  assert.deepEqual(Object.keys(parsed),result.questions.map(q=>q.key));
  assert.equal(parsed.购买物品,'无');
  const d=druid(lib,1);d.原初职能='卫士';const r=evaluate(lib,d);
  const changed=answerText(state(d),r,6);assert.ok(changed.includes('中甲'));assert.ok(changed.includes('武器熟练：简易和军用武器'));
});

test('purchase candidates match the priced catalog and quantity answers still calculate correctly',()=>{
  const answers={...druid(lib,1),购买物品:'匕首*2'},result=evaluate(lib,answers),s=state(answers);
  const q=result.questions.find(q=>q.key==='购买物品'),catalog=equipmentCatalog(lib),text=answerText(s,result,6);
  assert.deepEqual(q.candidates.map(i=>i.name),[...catalog.keys()]);
  for(const item of q.candidates)assert.ok(text.includes(`# ${item.name}（${item.priceCp/100}GP）`));
  assert.equal(parseAnswers(text,'render-test-1').购买物品,'匕首*2');
  assert.equal(result.snapshot.equipment.purchases[0].count,2);
  assert.ok(!result.issues.some(p=>p.key==='购买物品'));
});

test('each spell reference contains exactly that question’s candidates, including racial and restricted spellbook choices',()=>{
  const {answers}=basicCharacter(lib,'法师',12);
  Object.assign(answers,{种族:'精灵',种族分支:'高等精灵',种族施法属性:'智力'});
  const result=evaluate(lib,answers),s=state(answers),files=renderFiles(lib,s,result,5);
  const qs=result.questions.filter(q=>q.kind==='spell');
  assert.ok(qs.some(q=>q.key==='高等精灵戏法'));assert.ok(qs.some(q=>q.key==='3级学派法术书'));
  assert.equal([...files.keys()].filter(n=>n.startsWith('法术候选-')).length,qs.length);
  assert.ok(![...files.keys()].some(n=>n.startsWith('法术选项-')));
  for(const q of qs){
    const expected=q.options.map((n,i)=>`${i+1}. ${info(lib.find('spells',n))}`).join('\n\n');
    assert.equal(files.get(spellReferenceName(q)),`${q.key}\n选择${q.count}项；候选${q.options.length}项。\n\n`+expected);
  }
  for(const q of result.questions.filter(q=>q.options?.length&&q.options.every(n=>lib.find('spells',n))))assert.equal(q.kind,'spell',q.key);
});

test('empty dependent spell choices have their own reference and refresh from the chosen spellbook',()=>{
  const {answers}=basicCharacter(lib,'法师',1);delete answers['1级法术书新增'];
  let result=evaluate(lib,answers),q=result.questions.find(q=>q.key==='准备法术');assert.equal(q.options.length,0);
  assert.ok(renderFiles(lib,state(answers),result,5).get(spellReferenceName(q)).includes('先填写相关的前置选择'));
  const book=result.questions.find(q=>q.key==='1级法术书新增');answers[book.key]=book.options.slice(0,book.count).join('、');
  result=evaluate(lib,answers);q=result.questions.find(q=>q.key==='准备法术');
  assert.deepEqual(q.options,book.options.slice(0,book.count));
});
