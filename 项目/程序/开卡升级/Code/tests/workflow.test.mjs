import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadLibrary, ROOT } from '../library.mjs';
import { createCharacter, continueCharacter, upgradeCharacter, changeMode, readState, rollCharacter, recover, checkedPath } from '../store.mjs';
import { parseAnswers, answerText } from '../render.mjs';
import { evaluate } from '../rules.mjs';
import { druid } from './fixtures.mjs';
const lib=await loadLibrary();
const tempRoot=resolve(ROOT,'../../../开发记录/临时/开卡升级检查');await mkdir(tempRoot,{recursive:true});
async function fixture(mode='自由',answers=druid(lib)) {const base=await mkdtemp(join(tempRoot,'run-'));return createCharacter(lib,{base,answers,mode});}
async function replaceAnswers(dir,answers){const s=await readState(dir);const r=evaluate(lib,answers,{rolls:s.rolls,config:s.config});await writeFile(join(dir,'玩家文件','回答.txt'),answerText({...s,answers,mode:'自由'},r,0));}
test('a house rule is shown to the player, recorded in the result and retained on upgrade',async()=>{
  const base=await mkdtemp(join(tempRoot,'run-'));
  const f=await createCharacter(lib,{base,mode:'自由',answers:{...druid(lib,1),背景加值:'魅力、魅力、智力'},config:{freeBackgroundAbilities:true}});
  const read=(...parts)=>readFile(join(f.dir,...parts),'utf8');
  assert.match(await read('玩家文件','规则范围.txt'),/房规已开启/);
  assert.equal((await continueCharacter(lib,f.dir)).complete,true);
  assert.equal(JSON.parse(await read('成果','01级','角色.json')).config.freeBackgroundAbilities,true);
  assert.match(await read('成果','01级','能力.md'),/房规已开启/);
  const upgrade=await upgradeCharacter(lib,f.dir,2);
  assert.equal(upgrade.state.config.freeBackgroundAbilities,true);
  assert.ok(!upgrade.result.issues.some(e=>e.key==='背景加值'));
});
test('free mode completes in one submission; repeated continue leaves completed snapshot unchanged',async()=>{
  const f=await fixture();const r=await continueCharacter(lib,f.dir);assert.equal(r.complete,true);
  const original=await readFile(join(f.dir,'成果','12级','角色.json'),'utf8');const again=await continueCharacter(lib,f.dir);assert.equal(again.unchanged,true);
  assert.equal(await readFile(join(f.dir,'成果','12级','角色.json'),'utf8'),original);
  assert.ok((await readFile(join(f.dir,'成果','12级','能力.md'),'utf8')).includes('## 法术与专注'));
});
test('guided and free workflows calculate the same character',async()=>{
  const f=await fixture('自由'),g=await fixture('引导');const a=await continueCharacter(lib,f.dir),b=await continueCharacter(lib,g.dir);
  assert.deepEqual(a.result.snapshot,b.result.snapshot);
});
test('mode switching retains a partially filled answer and user files',async()=>{
  const f=await fixture('引导',{'角色名':'合成测试'});await writeFile(join(f.dir,'玩家文件','自己的笔记.txt'),'keep');
  await changeMode(lib,f.dir,'自由');const s=await readState(f.dir);assert.equal(s.answers.角色名,'合成测试');assert.equal(s.mode,'自由');
  assert.equal(await readFile(join(f.dir,'玩家文件','自己的笔记.txt'),'utf8'),'keep');
});
test('a new player can finish by filling only the currently visible questions',async()=>{
  const target=druid(lib),f=await fixture('引导',{'职业':'德鲁伊','目标等级':'12'});let done;
  const stages=[];
  for(let step=0;step<15;step++){
    const s=await readState(f.dir),text=await readFile(join(f.dir,'玩家文件','回答.txt'),'utf8');
    const visible=parseAnswers(text,s.id+'-'+s.revision);
    const replaced=text.split('\n').map(line=>{const m=line.match(/^([^#【：]+)：/);return m&&Object.hasOwn(visible,m[1])?m[1]+'：'+(target[m[1]]||''):line;}).join('\n');
    await writeFile(join(f.dir,'玩家文件','回答.txt'),replaced);done=await continueCharacter(lib,f.dir);stages.push(Object.keys(visible));
    if(done.state.referenceRound>s.referenceRound){
      const archived=await readdir(join(f.dir,'玩家文件',`第${s.referenceRound}轮参考txt`));
      assert.ok(archived.includes('本轮说明.txt'));assert.ok(!archived.includes('回答.txt'));
    }
    if(done.complete)break;
  }
  assert.equal(done.complete,true,JSON.stringify(done.result));assert.equal(done.result.snapshot.hpMax,135);assert.ok(stages.length>=7&&stages.length<=9);
});
test('failed publication can recover without losing committed answers',async()=>{
  const f=await fixture('自由',{'角色名':'合成恢复'});const s=await readState(f.dir);
  const names=JSON.parse(await readFile(join(f.dir,'生成清单.json'),'utf8'));
  // Simulate a process exit after ownership was persisted and one output was written.
  await writeFile(join(f.dir,'生成清单.json'),JSON.stringify([...names,'中断输出.txt']));await writeFile(join(f.dir,'玩家文件','中断输出.txt'),'partial');
  await recover(lib,f.dir);assert.equal((await readState(f.dir)).answers.角色名,s.answers.角色名);
  assert.ok(!(await readdir(join(f.dir,'玩家文件'))).includes('中断输出.txt'));
});
test('stale tabs cannot overwrite new answers; recovery retains stale content in history',async()=>{
  const f=await fixture('引导',{'角色名':'合成测试'});const old=await readFile(join(f.dir,'玩家文件','回答.txt'),'utf8');await changeMode(lib,f.dir,'自由');
  await writeFile(join(f.dir,'玩家文件','回答.txt'),old);await assert.rejects(continueCharacter(lib,f.dir),/之前的填写版本/);
  await recover(lib,f.dir);assert.equal((await readState(f.dir)).mode,'自由');assert.ok((await readdir(join(f.dir,'历史'))).length>=2);
});
test('rolls persist across repeated requests and mode switches',async()=>{
  const f=await fixture('自由',{...druid(lib,1),属性方式:'程序掷骰',生命值方式:'程序掷骰'});const a=await rollCharacter(lib,f.dir);await changeMode(lib,f.dir,'引导');const b=await rollCharacter(lib,f.dir);assert.deepEqual(a.state.rolls,b.state.rolls);
  assert.equal(a.state.rolls.abilityDice.length,6);assert.ok(a.state.rolls.abilityDice.every(d=>d.length===4));
});
test('12→13 upgrade preserves old level, increases HP and demands new prepared spell',async()=>{
  const f=await fixture();await continueCharacter(lib,f.dir);const before=await readFile(join(f.dir,'成果','12级','角色.json'),'utf8');
  const u=await upgradeCharacter(lib,f.dir,13);assert.ok(u.result.issues.some(e=>e.key==='准备法术'));assert.equal(u.result.snapshot.hpMax,146);
  const a={...u.state.answers};const q=u.result.questions.find(q=>q.key==='准备法术');const selected=a.准备法术.split('、');a.准备法术+="、"+q.options.find(n=>!selected.includes(n));await replaceAnswers(f.dir,a);
  const done=await continueCharacter(lib,f.dir);assert.equal(done.complete,true,JSON.stringify(done.result.issues));assert.equal(done.result.snapshot.spellcasting.maxSpell,7);
  assert.equal(await readFile(join(f.dir,'成果','12级','角色.json'),'utf8'),before);
});
test('upgrading rejects edits to old background and old feat choices',async()=>{
  const f=await fixture();await continueCharacter(lib,f.dir);await upgradeCharacter(lib,f.dir,13);const s=await readState(f.dir);s.answers.背景='隐士';await replaceAnswers(f.dir,s.answers);
  const r=await continueCharacter(lib,f.dir);assert.equal(r.complete,false);assert.ok(r.result.issues.some(e=>e.key==='背景'&&e.message.includes('原角色')));
});
test('parser rejects duplicate fields and foreign header; path guard rejects traversal',async()=>{
  assert.throws(()=>parseAnswers('角色回答 · t\n职业：德鲁伊\n职业：战士','t'),/重复/);
  assert.throws(()=>parseAnswers('角色回答 · old','t'),/之前/);
  await assert.rejects(checkedPath(resolve('项目/资源')),/存档目录/);
});
test('a same-revision answer from another character is rejected',async()=>{
  const a=await fixture('自由',{'角色名':'合成甲'}),b=await fixture('自由',{'角色名':'合成乙'});
  const foreign=await readFile(join(a.dir,'玩家文件','回答.txt'),'utf8');await writeFile(join(b.dir,'玩家文件','回答.txt'),foreign);
  await assert.rejects(continueCharacter(lib,b.dir),/填写版本/);assert.equal((await readState(b.dir)).answers.角色名,'合成乙');
});

test('completed rounds archive only generated references under player files; partial edits and recovery keep round numbering',async()=>{
  const f=await fixture('引导',{角色名:'合成归档'}),player=join(f.dir,'玩家文件');
  await writeFile(join(player,'自己的笔记.txt'),'keep');
  await continueCharacter(lib,f.dir);assert.equal((await readState(f.dir)).referenceRound,1);
  assert.ok(!(await readdir(player)).some(n=>/^第\d+轮参考txt$/.test(n)));
  const reference=await readFile(join(player,'职业总览.txt'),'utf8');
  await replaceAnswers(f.dir,druid(lib));await continueCharacter(lib,f.dir);
  const archive=join(player,'第1轮参考txt');
  assert.equal(await readFile(join(archive,'职业总览.txt'),'utf8'),reference);
  assert.ok(!(await readdir(archive)).some(n=>['回答.txt','继续.cmd','自己的笔记.txt'].includes(n)));
  assert.equal(await readFile(join(player,'自己的笔记.txt'),'utf8'),'keep');
  await recover(lib,f.dir);await recover(lib,f.dir);await changeMode(lib,f.dir,'自由');
  assert.deepEqual((await readdir(player)).filter(n=>/^第\d+轮参考txt$/.test(n)),['第1轮参考txt']);
  assert.equal(await readFile(join(archive,'职业总览.txt'),'utf8'),reference);
});

test('interrupted reference archive resumes without replacing earlier moved files',async()=>{
  const f=await fixture('引导',{角色名:'合成中断'}),player=join(f.dir,'玩家文件'),archive=join(player,'第1轮参考txt');
  const names=JSON.parse(await readFile(join(f.dir,'生成清单.json'),'utf8')).filter(n=>n.endsWith('.txt')&&n!=='回答.txt');
  const original=await readFile(join(player,names[0]),'utf8');
  const s=await readState(f.dir);s.archiveRound=1;s.referenceRound=2;
  await writeFile(join(f.dir,'状态.json'),JSON.stringify(s));
  await writeFile(join(f.dir,'参考归档清单.json'),JSON.stringify({1:{files:names,complete:false}}));
  await mkdir(archive);await rename(join(player,names[0]),join(archive,names[0]));
  await assert.rejects(continueCharacter(lib,f.dir),/recover/);
  await recover(lib,f.dir);
  assert.equal(await readFile(join(archive,names[0]),'utf8'),original);
  assert.deepEqual((await readdir(archive)).sort(),names.sort());
  assert.equal(JSON.parse(await readFile(join(f.dir,'参考归档清单.json'),'utf8'))[1].complete,true);
});

test('a user-owned round folder is preserved and blocks publication until moved aside',async()=>{
  const f=await fixture(),archive=join(f.dir,'玩家文件','第1轮参考txt');await mkdir(archive);
  await writeFile(join(archive,'笔记.txt'),'keep');
  await assert.rejects(continueCharacter(lib,f.dir),/已有/);
  assert.equal(await readFile(join(archive,'笔记.txt'),'utf8'),'keep');
  await rename(archive,archive+'-自存');await recover(lib,f.dir);
  assert.ok((await readdir(archive)).includes('职业总览.txt'));
});

test('legacy character states without reference rounds still complete and archive from round one',async()=>{
  const f=await fixture(),s=await readState(f.dir);delete s.referenceRound;
  await writeFile(join(f.dir,'状态.json'),JSON.stringify(s));
  const done=await continueCharacter(lib,f.dir);assert.equal(done.complete,true);assert.equal(done.state.referenceRound,2);
  assert.ok((await readdir(join(f.dir,'玩家文件','第1轮参考txt'))).includes('职业总览.txt'));
});
