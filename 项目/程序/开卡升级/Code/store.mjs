import { mkdir, readFile, writeFile, rename, open, unlink, readdir, lstat } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { randomUUID, randomInt } from 'node:crypto';
import { ROOT, VERSION, pad } from './library.mjs';
import { evaluate, split } from './rules.mjs';
import { parseAnswers, renderFiles, visibleQuestions, markdownPair, summary } from './render.mjs';

export const STORE = join(ROOT,'存档');
export async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function noLinks(path){let p=resolve(path);for(;;){try{if((await lstat(p)).isSymbolicLink())throw new Error('存档路径不能经过符号链接或目录联接。');}catch(e){if(e.code!=='ENOENT')throw e;}const next=dirname(p);if(next===p)break;p=next;}}
export async function checkedPath(path,base=STORE){const p=resolve(path),r=relative(resolve(base),p);if(!r||r.startsWith('..')||isAbsolute(r))throw new Error('请选择本工具存档目录中的角色。');await noLinks(p);return p;}
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
async function atomic(path,value){await noLinks(path);const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(temp,path);}
export async function readState(dir){await noLinks(dir);return json(join(dir,'状态.json'));}
async function locked(dir,action,filename='.lock'){
  let lockPath=join(dir,filename);
  try{await (await open(lockPath,'wx')).close();}
  catch(e){if(e.code==='EEXIST')throw new Error('文件夹正在被另一个进程处理。若上次异常退出，请在工具关闭后移走锁文件再试。');throw e;}
  try{return await action(newDir=>{lockPath=join(newDir,filename);});}
  finally{await unlink(lockPath);}
}

function archiveName(name,createdAt,index){
  const safe=Array.from(String(name||'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim()).slice(0,56).join('').replace(/^[. ]+|[. ]+$/g,'')||'未命名角色';
  const d=new Date(createdAt);
  const stamp=pad(d.getMonth()+1)+pad(d.getFullYear()%100)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes());
  return safe+(index===1?'':`（${index}）`)+'_'+stamp+'开始创建';
}

async function availableDirectory(base,name,createdAt,current){
  for(let index=1;;index++){
    const target=await checkedPath(join(base,archiveName(name,createdAt,index)),base);
    if(target===current||!await exists(target))return target;
  }
}

async function finalizeDirectory(dir,s,relocate){
  if(!s.namePending||!s.answers.角色名?.trim())return {dir};
  const base=dirname(resolve(dir));
  dir=await checkedPath(dir,base);
  return locked(base,async()=>{
    const target=await availableDirectory(base,s.answers.角色名,s.createdAt,dir);
    if(target!==dir){
      try{await rename(dir,target);}
      catch(e){
        if(!['EPERM','EACCES','EBUSY','ENOTEMPTY','EEXIST'].includes(e.code))throw e;
        return {dir,namingWarning:'本轮已保存。角色目录暂不能改名，请关闭占用旧目录的编辑器或窗口，再选择“恢复当前文件”。'};
      }
      relocate(target);
    }
    s.namePending=false;
    await atomic(join(target,'状态.json'),s);
    return {dir:target};
  },'.命名锁');
}
function ensureVersion(lib,s){if(s.version!==VERSION||s.sourceHash!==lib.hash)throw new Error('规则或本地资料版本与角色不一致。请恢复该角色原版本资料；工具不会自动改写旧角色。');}
function ensureRolls(lib,s){
  if(s.answers.属性方式==='程序掷骰'&&!s.rolls.abilities){s.rolls.abilityDice=Array.from({length:6},()=>Array.from({length:4},()=>randomInt(1,7)));s.rolls.abilities=s.rolls.abilityDice.map(ds=>[...ds].sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0));}
  if(s.answers.生命值方式==='程序掷骰'){
    const c=lib.find('classes',s.answers.职业),die=Number(c?.tables[0]?.rows.find(r=>r[0].includes('生命值骰'))?.[1].match(/D(\d+)/i)?.[1]),level=Number(s.answers.目标等级);
    if(!die||!Number.isInteger(level)||level<1||level>20)return;
    s.rolls.hp??=[];while(s.rolls.hp.length<level-1)s.rolls.hp.push(randomInt(1,die+1));
  }
}
function evaluationContext(s){
  const legacyChoices=s.namePending===undefined
    ?(s.base?.answers||(s.status==='complete'||s.answers.重复技能补选?s.answers:undefined))
    :undefined;
  return {rolls:s.rolls,config:s.config,legacyChoices};
}
function resultFor(lib,s){const r=evaluate(lib,s.answers,evaluationContext(s));if(s.base)checkUpgrade(s,r);return r;}

async function readSubmission(dir,s,questions){
  const text=await readFile(join(dir,'玩家文件','回答.txt'),'utf8');
  const incoming=parseAnswers(text,s.id+'-'+s.revision);
  const shown=await json(join(dir,'问卷选项.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  for(const q of questions){
    if(!q.options||!Object.hasOwn(incoming,q.key))continue;
    const values=q.multiple?split(incoming[q.key]):[incoming[q.key].normalize('NFKC')];
    if(!values.some(v=>/^\d+$/.test(v)))continue;
    const options=shown?.revision===s.revision&&Object.hasOwn(shown.options,q.key)?shown.options[q.key]:null;
    if(!options)throw new Error(`${q.key}：此问卷没有可核对的选项编号，请填写选项名称。`);
    incoming[q.key]=values.map(v=>{
      if(!/^\d+$/.test(v))return v;
      const name=options[Number(v)-1];
      if(name===undefined)throw new Error(`${q.key}：没有选项编号${v}。`);
      return name;
    }).join('、');
  }
  return {text,incoming};
}
function checkUpgrade(s,r){
  const base=s.base,delta=Number(s.answers.目标等级)-base.snapshot.level;
  const error=(key,message)=>r.issues.push({key,stage:0,message:key+'：'+message});
  const mutable=new Set(['目标等级','职业戏法','准备法术','野兽形态','大地地形','兽之形貌','猎杀技艺','防守战术','超魔法','魔能祈唤','武器精通','高等精灵戏法','战斗风格','穿戴护甲','使用盾牌','常用武器','购买物品','升级生命骰']);
  for(const [key,value] of Object.entries(base.answers)){
    if(mutable.has(key)||/法术精通|仪式$|原初.*教习|戏法$|法术$/.test(key))continue;
    if((s.answers[key]||'')!==value)error(key,'这是原角色已确定的选择；升级保留原值。');
  }
  if(delta<1||delta>20)error('目标等级','升级目标应高于原等级且不超过20。');
  for(const key of ['职业戏法','超魔法','魔能祈唤',...Object.keys(base.answers).filter(k=>/专长.*(?:戏法|法术)$/.test(k))]){
    if(key==='职业戏法'&&['法师'].includes(base.snapshot.className))continue;
    const old=split(base.answers[key]),now=split(s.answers[key]);
    if(old.filter(n=>!now.includes(n)).length>delta)error(key,`本次跨${delta}级，最多替换${delta}项。`);
  }
  if(['吟游诗人','术士','魔契师'].includes(base.snapshot.className)||['奥法骑士','诡术师'].includes(base.snapshot.subclass)){
    const old=split(base.answers.准备法术),now=split(s.answers.准备法术);
    if(old.filter(n=>!now.includes(n)).length>delta)error('准备法术',`本次最多替换${delta}道原有法术，新增另算。`);
  }
  if(base.answers.生命值方式==='填写骰点'&&!split(base.answers.升级生命骰).every((v,i)=>split(s.answers.升级生命骰)[i]===v))error('升级生命骰','不能更改以前等级的骰点。');
  if(r.snapshot){r.snapshot.currentState=base.snapshot.currentState??null;r.snapshot.upgradedFrom=base.snapshot.level;}
}

async function referenceArchives(dir){return json(join(dir,'参考归档清单.json')).catch(e=>{if(e.code==='ENOENT')return {};throw e;});}
async function requirePublishedReferences(dir,s){
  if(s.archiveRound&&!(await referenceArchives(dir))[s.archiveRound]?.complete)throw new Error('上轮参考资料尚未归档完成，请先运行 recover 恢复当前文件。');
}
async function archiveReferences(dir,s){
  if(!s.archiveRound)return;
  const round=s.archiveRound;
  if(!Number.isSafeInteger(round)||round<1)throw new Error('参考轮次记录损坏。');
  const player=join(dir,'玩家文件'),destination=join(player,`第${round}轮参考txt`),indexPath=join(dir,'参考归档清单.json');
  const index=await referenceArchives(dir);let entry=index[round];
  if(entry?.complete)return;
  await noLinks(destination);
  if(!entry){
    if(await exists(destination))throw new Error(`玩家文件夹中已有“第${round}轮参考txt”，已保留。请移开自有同名目录后恢复当前文件。`);
    const previous=await json(join(dir,'生成清单.json'));
    entry={files:previous.filter(n=>n.endsWith('.txt')&&n!=='回答.txt'),complete:false};
    index[round]=entry;
    // Claim the destination before moving files, so an interrupted archive can resume.
    await atomic(indexPath,index);
  }
  await mkdir(destination,{recursive:true});
  for(const filename of entry.files){
    if(filename.includes('/')||filename.includes('\\')||!filename.endsWith('.txt')||filename==='回答.txt')throw new Error('参考归档清单损坏。');
    const from=join(player,filename),to=join(destination,filename);await noLinks(from);await noLinks(to);
    if(!await exists(to)&&await exists(from))await rename(from,to);
  }
  entry.complete=true;await atomic(indexPath,index);
}

async function publish(lib,dir,s,result){
  const player=join(dir,'玩家文件');await mkdir(player,{recursive:true});
  await archiveReferences(dir,s);
  const candidates=[...result.issues,...result.missing];const stage=candidates.length?Math.min(...candidates.map(p=>p.stage)):6;
  const files=renderFiles(lib,s,result,stage);
  const launcher='@echo off\r\nchcp 65001 >nul\r\nsetlocal DisableDelayedExpansion\r\n"%~dp0..\\..\\..\\打开工具.cmd" continue "%~dp0.."\r\n';
  files.set('继续.cmd',launcher);
  const history=join(dir,'历史',pad(s.revision)+'-'+Date.now()+'-'+randomUUID());await mkdir(history,{recursive:true});
  const previous=await json(join(dir,'生成清单.json')).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  for(const filename of files.keys())if(!previous.includes(filename)&&await exists(join(player,filename)))throw new Error('玩家文件夹中存在同名自有文件，已保留：'+filename);
  // Persist ownership before writing a generation so recovery can finish partial publication.
  await atomic(join(dir,'生成清单.json'),[...new Set([...previous,...files.keys()])]);
  for(const filename of previous){
    if(filename.includes('/')||filename.includes('\\')||filename==='.'||filename==='..')throw new Error('生成文件清单损坏。');
    const path=join(player,filename);await noLinks(path);
    if(await exists(path))await rename(path,join(history,filename));
  }
  for(const [filename,body] of files){const path=join(player,filename);if(await exists(path))throw new Error('玩家文件夹中存在同名自有文件，已保留：'+filename);await atomic(path,body);}
  await atomic(join(dir,'生成清单.json'),[...files.keys()]);
  const options=Object.fromEntries(visibleQuestions(s,result,stage).filter(q=>q.options).map(q=>[q.key,q.options]));
  await atomic(join(dir,'问卷选项.json'),{revision:s.revision,options});
  await atomic(join(dir,'检查.json'),{complete:!result.issues.length&&!result.missing.length,stage,issues:result.issues,missing:result.missing,questions:result.questions.map(q=>({key:q.key,stage:q.stage,count:q.count})),revision:s.revision});
  return {stage,files:files.size};
}

export async function createCharacter(lib,{base=STORE,answers={},mode='引导',config={}}={}){
  if(!['引导','自由'].includes(mode))throw new Error('模式只能是引导或自由。');
  await noLinks(base);await mkdir(base,{recursive:true});
  const id='character-'+randomUUID(),createdAt=new Date().toISOString();
  const dir=await locked(base,async()=>{
    const target=await availableDirectory(base,answers.角色名,createdAt);
    await mkdir(target);
    return target;
  },'.命名锁');
  const s={version:VERSION,sourceHash:lib.hash,id,revision:1,referenceRound:1,mode,answers,rolls:{},config:{extraGoldCp:0,...config},status:'draft',createdAt,namePending:!answers.角色名?.trim()};
  await atomic(join(dir,'状态.json'),s);const result=resultFor(lib,s);await publish(lib,dir,s,result);
  return {dir,state:s,result};
}

export async function continueCharacter(lib,dir,{checkOnly=false}={}){
  return locked(dir,async relocate=>{
    let s=await readState(dir);ensureVersion(lib,s);await requirePublishedReferences(dir,s);
    const resultBefore=resultFor(lib,s), known=new Set(resultBefore.questions.map(q=>q.key));
    const {text,incoming}=await readSubmission(dir,s,resultBefore.questions);
    const merged={...s.answers,...incoming};
    if(!checkOnly&&s.status!=='complete')ensureRolls(lib,{...s,answers:merged});
    const result=evaluate(lib,merged,evaluationContext(s));
    for(const q of result.questions)known.add(q.key);
    const unknown=Object.keys(incoming).filter(k=>!known.has(k));if(unknown.length)throw new Error('无法识别问题名称：'+unknown.join('、')+'。请保留原问题名称。');
    const revised={...s,answers:{...merged,...result.canonical}};const evaluated=resultFor(lib,revised);
    const complete=!evaluated.issues.length&&!evaluated.missing.length;
    if(checkOnly){await atomic(join(dir,'检查.json'),{complete,issues:evaluated.issues,missing:evaluated.missing,revision:s.revision});return {state:revised,result:evaluated,complete,checkOnly:true};}
    if(s.status==='complete'){
      if(JSON.stringify(merged)!==JSON.stringify(s.answers))throw new Error('此等级已完成。请从工具入口选择“升级”，原卡保留。');
      return {state:s,result:evaluated,complete:true,unchanged:true,...await finalizeDirectory(dir,s,relocate)};
    }
    const priorProblems=[...resultBefore.issues,...resultBefore.missing];
    const priorStage=priorProblems.length?Math.min(...priorProblems.map(p=>p.stage)):6;
    const advance=complete||(s.mode==='引导'&&![...evaluated.issues,...evaluated.missing].some(p=>p.stage<=priorStage));
    const round=s.referenceRound||1;
    s={...revised,revision:s.revision+1,referenceRound:round+(advance?1:0),archiveRound:advance?round:null,updatedAt:new Date().toISOString(),status:complete?'complete':'draft'};
    await mkdir(join(dir,'历史'),{recursive:true});
    await atomic(join(dir,'历史','输入-'+s.revision+'-'+Date.now()+'.txt'),text);
    await atomic(join(dir,'状态.json'),s);
    if(complete)await saveCompleted(lib,dir,s,evaluated);
    await publish(lib,dir,s,evaluated);
    return {state:s,result:evaluated,complete,...await finalizeDirectory(dir,s,relocate)};
  });
}

async function saveCompleted(lib,dir,s,result){
  const destination=join(dir,'成果',pad(result.snapshot.level)+'级');await mkdir(destination,{recursive:true});
  const path=join(destination,'角色.json');
  if(await exists(path)){const old=await json(path);if(old.id===s.id&&JSON.stringify(old.answers)===JSON.stringify(s.answers))return;throw new Error('已有该等级成果，保留原件，未覆盖。');}
  const pair=markdownPair(lib,s,result);
  for(const [filename,body] of Object.entries(pair))await atomic(join(destination,filename),body);
  await atomic(join(destination,'角色卡.txt'),summary(result.snapshot));
  if(s.base)await atomic(join(destination,'升级变化.txt'),`从${s.base.snapshot.level}级升至${result.snapshot.level}级\n\n`+Object.entries(s.answers).filter(([k,v])=>v!==s.base.answers[k]).map(([k,v])=>`${k}：${s.base.answers[k]||'无'} → ${v}`).join('\n'));
  await atomic(path,{id:s.id,version:s.version,sourceHash:s.sourceHash,config:s.config,answers:s.answers,rolls:s.rolls,snapshot:result.snapshot});
}

export async function recover(lib,dir){return locked(dir,async relocate=>{const s=await readState(dir);ensureVersion(lib,s);const r=resultFor(lib,s);if(s.status==='complete'&&!r.issues.length&&!r.missing.length)await saveCompleted(lib,dir,s,r);await publish(lib,dir,s,r);return {state:s,result:r,...await finalizeDirectory(dir,s,relocate)};});}
export async function changeMode(lib,dir,mode){if(!['引导','自由'].includes(mode))throw new Error('请选择引导或自由。');
  return locked(dir,async()=>{let s=await readState(dir);ensureVersion(lib,s);await requirePublishedReferences(dir,s);const {incoming}=await readSubmission(dir,s,resultFor(lib,s).questions);s={...s,answers:{...s.answers,...incoming},mode,revision:s.revision+1};await atomic(join(dir,'状态.json'),s);const r=resultFor(lib,s);await publish(lib,dir,s,r);return {state:s,result:r};});}
export async function rollCharacter(lib,dir){return locked(dir,async()=>{
  const s=await readState(dir);ensureVersion(lib,s);await requirePublishedReferences(dir,s);if(s.status==='complete')throw new Error('此等级已完成，不能重新掷骰。');
  const {incoming}=await readSubmission(dir,s,resultFor(lib,s).questions);s.answers={...s.answers,...incoming};
  ensureRolls(lib,s);
  s.revision++;await atomic(join(dir,'状态.json'),s);const r=resultFor(lib,s);await publish(lib,dir,s,r);return {state:s,result:r};
});}
export async function upgradeCharacter(lib,dir,target){return locked(dir,async()=>{
  const s=await readState(dir);ensureVersion(lib,s);await requirePublishedReferences(dir,s);if(s.status!=='complete')throw new Error('先完成当前角色，再升级。');
  const previous=Number(s.answers.目标等级);if(!Number.isInteger(target)||target<=previous||target>20)throw new Error('目标须高于当前等级且不超过20。');
  const base=await json(join(dir,'成果',pad(previous)+'级','角色.json'));
  s.archiveRound=s.referenceRound||1;s.referenceRound=s.archiveRound+1;
  s.base=base;s.answers.目标等级=String(target);s.status='draft';s.revision++;
  await atomic(join(dir,'状态.json'),s);const r=resultFor(lib,s);await publish(lib,dir,s,r);return {state:s,result:r};
});}
export async function listCharacters(base=STORE){if(!await exists(base))return [];const result=[];for(const entry of await readdir(base,{withFileTypes:true})){const {name}=entry;if(!entry.isDirectory()||!(/^character-[a-f0-9-]+$/.test(name)||/_\d{6}_\d{4}开始创建$/.test(name)))continue;const dir=join(base,name);try{const s=await readState(dir);result.push({dir,id:s.id,name:s.answers.角色名||'未命名角色',level:s.answers.目标等级||'待填写',className:s.answers.职业||'待填写',mode:s.mode,status:s.status});}catch(e){result.push({dir,name:'无法读取：'+name,error:e.message});}}return result;}
