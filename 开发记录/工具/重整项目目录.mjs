import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile), hash = value => createHash('sha256').update(value).digest('hex');
const portable = value => value.split(sep).join('/');
const INDEX = '资源/故事/G/管理索引.json', MARKER = '资源/故事/G/目录迁移.json';
const AUTHORITY = '资源/故事/Z/战役存档';
const lockNames = new Set(['.workspace.lock','.battle.lock','.管理.lock']);
const cacheNames = new Set(['战斗窗口','browser','browser-profile','browser-profiles','浏览器配置','浏览器缓存','.cache','cache','code cache','gpucache','shadercache','grshadercache','crashpad','browsermetrics']);
const nonNode = new Set(['svchost.exe','services.exe','lsass.exe','wininit.exe','winlogon.exe','csrss.exe','smss.exe','dwm.exe',
  'conhost.exe','fontdrvhost.exe','sihost.exe','taskhostw.exe','explorer.exe','powershell.exe','pwsh.exe','cmd.exe','tasklist.exe','notepad.exe','msedge.exe','chrome.exe','firefox.exe']);
const pathKey = value => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
const serialize = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const parse = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
const absent = error => error.code === 'ENOENT';
function relativePath(value) {
  if(typeof value!=='string'||!value||isAbsolute(value)||/[\\:\x00-\x1f]/.test(value)||value.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('项目相对路径无效。');
  return value;
}
function segment(value) {
  if(typeof value!=='string'||!value||value.length>100||/[\\/:*?"<>|\x00-\x1f]/.test(value)||/[. ]$/.test(value)||['.','..'].includes(value)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))throw Error('模组文件夹名称无效。');
  return value;
}
async function status(path) { try{return await lstat(path);}catch(error){if(absent(error))return null;throw error;} }
function contained(root,path) {
  const suffix=relative(root,path);
  if(isAbsolute(suffix)||suffix==='..'||suffix.startsWith('..'+sep))throw Error('路径超出指定根目录。');
  return path;
}
async function guard(root,path) {
  root=resolve(root);path=contained(root,resolve(path));
  const base=await lstat(root);
  if(!base.isDirectory()||base.isSymbolicLink()||pathKey(await realpath(root))!==pathKey(root))throw Error('根目录不是无链接的实际目录。');
  let current=root;
  for(const part of relative(root,path).split(sep).filter(Boolean)){
    current=join(current,part);const item=await status(current);if(!item)break;
    if(item.isSymbolicLink()||pathKey(await realpath(current))!==pathKey(current))throw Error('路径含链接或目录联接，未跟随。');
  }
  return path;
}
async function bytes(root,rel,optional=false) {
  const path=await guard(root,join(root,relativePath(rel)));
  try{
    const named=await lstat(path);if(!named.isFile()||named.nlink>1)throw Error('不是普通非硬链接文件。');
    const handle=await open(path,'r');
    try{const before=await handle.stat(),value=await handle.readFile(),after=await handle.stat();
      if(before.ino!==named.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('读取时文件发生变化。');
      await guard(root,path);return value;
    }finally{await handle.close();}
  }catch(error){if(optional&&absent(error))return null;throw error;}
}
export async function readProcessIdentity(pid){
  if(process.platform!=='win32')return {kind:'unknown'};
  try{
    const {stdout}=await execute('tasklist.exe',['/FI',`PID eq ${pid}`,'/FO','CSV','/NH'],{windowsHide:true,timeout:3000,maxBuffer:65536,encoding:'utf8'});
    for(const line of stdout.split(/\r?\n/)){
      const match=line.trim().match(/^"((?:[^"]|"")*)","(\d+)"(?:,|$)/);if(!match||Number(match[2])!==pid)continue;
      const executable=match[1].replaceAll('""','"').toLowerCase();
      if(!/^[^\\/:\x00-\x1f]+\.exe$/i.test(executable))return {kind:'unknown'};
      return {kind:executable.includes('node')?'node':nonNode.has(executable)?'non-node':'unknown',executable};
    }
  }catch{}
  return {kind:'unknown'};
}
async function activeLock(root,rel,identity){
  const raw=(await bytes(root,rel)).toString('utf8').trim();
  if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>2147483647)throw Error('锁文件PID无效，保留原件。');
  const pid=Number(raw);let alive=true;
  try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')alive=false;else if(!['EPERM','EACCES'].includes(error.code))throw error;}
  if(alive&&(await identity(pid))?.kind!=='non-node')throw Error('存在活动Node或身份未明的存档锁；未停止任何程序。');
  return {path:rel,pid,status:alive?'reused-non-node-pid':'stale'};
}
export function relocateProjectPath(value,mappings){
  if(typeof value!=='string')return value;
  const selected=mappings.filter(item=>value===item.from||value.startsWith(item.from+'/')).sort((a,b)=>b.from.length-a.from.length)[0];
  return selected?selected.to+value.slice(selected.from.length):value;
}
function relocateJson(value,mappings){
  if(typeof value==='string')return relocateProjectPath(value,mappings);
  if(Array.isArray(value))return value.map(item=>relocateJson(item,mappings));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,relocateJson(item,mappings)]));
  return value;
}
function excludedFromBattle(rel){return rel.split('/').some(part=>cacheNames.has(part.toLowerCase())||lockNames.has(part.toLowerCase())||part==='.工作区')||/\.(?:log|tmp|lock|cmd)$/i.test(rel);}
function platformEntryBytes(){
  const code=String.raw`const f=require('node:fs'),p=require('node:path'),c=require('node:child_process');let project=p.resolve(process.argv[1]);const entryAt=root=>p.join(root,'\u8d44\u6e90','\u7a0b\u5e8f','\u5e73\u53f0','project-entry.mjs');while(!f.existsSync(entryAt(project))){const parent=p.dirname(project);if(parent===project){console.error('Platform entry not found. Open the main project.');process.exit(1);}project=parent;}console.log('Select your group from the Modules window.');const result=c.spawnSync(process.execPath,[entryAt(project)],{stdio:'inherit',windowsHide:true});if(result.error)console.error(result.error.message);process.exit(result.status??1);`;
  return Buffer.from(['@echo off','setlocal',`node -e "${code}" -- "%~dp0."`,'if errorlevel 1 goto failed','exit /b 0',':failed','echo Platform startup failed. Check the message above.','pause','exit /b 1',''].join('\r\n'),'ascii');
}

/** Builds a hash-only manifest. No source file or destination is changed. */
export async function planProjectLayout({projectRoot,processIdentity=readProcessIdentity,archiveOnlyCampaignIds=[],includeDetachedCampaignIds=[]}={}){
  if(typeof projectRoot!=='string')throw Error('请明确指定项目根。');
  const root=resolve(projectRoot);await guard(root,root);
  const plan={version:2,kind:'project-layout-migration',projectRoot:root,status:'planned',blockers:[],warnings:[],locks:[],
    sourceManifest:[],archiveRoots:[],dependencyMoves:[],operations:[],directories:[],mappings:[],moduleFolders:{},options:{archiveOnlyCampaignIds:[...archiveOnlyCampaignIds].sort(),includeDetachedCampaignIds:[...includeDetachedCampaignIds].sort()}};
  const bufferCache=new Map(),existing=new Map(),operationBuffers=new Map();
  async function read(rel,optional=false){if(bufferCache.has(rel))return bufferCache.get(rel);const value=await bytes(root,rel,optional);if(value!==null)bufferCache.set(rel,value);return value;}
  function block(path,message){plan.blockers.push({path,message});}
  async function inventory(rel){
    const tree=await status(join(root,rel));if(!tree)return;
    try{await guard(root,join(root,rel));if(!tree.isDirectory())throw Error('源树不是目录。');}
    catch(error){block(rel,error.message);return;}
    plan.archiveRoots.push(rel);
    async function walk(folder){
      for(const entry of (await readdir(join(root,folder),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
        const path=folder+'/'+entry.name;
        if(entry.isSymbolicLink()){
          if(entry.name==='node_modules'){plan.warnings.push({path,message:'依赖目录为联接，未跟随；保留到旧布局归档，不复制目标。'});continue;}
          block(path,'源树含链接，不能迁移或跟随。');continue;
        }
        if(entry.isDirectory()){await walk(path);continue;}
        try{
          if(!entry.isFile())throw Error('源树含非常规文件。');
          const value=await read(path);existing.set(path,{path,bytes:value.length,sha256:hash(value)});
          if(lockNames.has(entry.name.toLowerCase()))plan.locks.push(await activeLock(root,path,processIdentity));
          if(/\/.runtime\/launch-[a-f0-9]+\.json$/i.test(path)){
            const owner=parse(value),pid=owner.pid;
            if(Number.isInteger(pid)&&pid>0){let alive=true;try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')alive=false;else if(!['EPERM','EACCES'].includes(error.code))throw error;}
              if(alive&&(await processIdentity(pid))?.kind!=='non-node')throw Error('旧平台启动记录仍指向活动Node或未知进程，未迁移其运行目录。');}
          }
        }catch(error){block(path,error.message);}
      }
    }
    await walk(rel);
  }
  const oldRoots=['程序','骰盘','资料','当前','战斗','对话','存档','跑团平台','平台',AUTHORITY];
  for(const rel of oldRoots)await inventory(rel);
  for(const rel of [INDEX,'资源/故事/F/发放记录.json','资源/故事/G/.管理.lock','资源/故事/G/待完成事务.json']){
    try{const value=await read(rel,true);if(value!==null){existing.set(rel,{path:rel,bytes:value.length,sha256:hash(value)});
      if(rel.endsWith('.lock'))plan.locks.push(await activeLock(root,rel,processIdentity));
      if(rel.endsWith('待完成事务.json'))block(rel,'存在未完成事务，须由原程序恢复后再迁移。');}}
    catch(error){block(rel,error.message);}
  }
  let index={formatVersion:1,revision:0,files:[],documents:{}};
  try{const raw=await read(INDEX,true);if(raw)index=parse(raw);if(index.formatVersion!==1||!index.documents||!Array.isArray(index.files))throw Error('管理索引格式无效。');}
  catch(error){block(INDEX,error.message);}
  plan.moduleFolders={...(index.moduleFolders||{})};
  const claimed=new Map();
  for(const [id,folder]of Object.entries(plan.moduleFolders)){
    try{segment(folder);const lower=folder.toLowerCase();if(claimed.has(lower)&&claimed.get(lower)!==id)throw Error('目录被多个模组ID占用。');claimed.set(lower,id);}
    catch(error){block(INDEX,error.message);}
  }
  function addMapping(from,to){relativePath(from);relativePath(to);const prior=plan.mappings.find(item=>item.from===from);if(prior&&prior.to!==to)throw Error('同一旧路径存在冲突映射。');if(!prior)plan.mappings.push({from,to});}
  addMapping('程序','资源/程序');addMapping('骰盘','资源/程序/骰盘');addMapping('资料','资源/资料');
  addMapping('存档','模组');addMapping(AUTHORITY,'模组');
  let workspace=null;
  try{const raw=await read(AUTHORITY+'/工作区.json',true);if(raw){workspace=parse(raw);if(workspace.formatVersion!==1||!Array.isArray(workspace.campaigns))throw Error('旧工作区索引格式无效。');}}
  catch(error){block(AUTHORITY+'/工作区.json',error.message);}
  const registered=new Set(),campaigns=[],knownIds=new Set();
  async function registerCampaign(campaign,{detached=false}={}){
    try{
      if(!campaign.id||typeof campaign.id!=='string'||!/^[\w-]{1,100}$/.test(campaign.id)||knownIds.has(campaign.id))throw Error('团ID无效或重复。');
      relativePath(campaign.path);const old=AUTHORITY+'/'+campaign.path;registered.add(campaign.path.split('/')[0]);
      const meta=parse(await read(old+'/团资料.json'));if(meta.id!==campaign.id||!Array.isArray(meta.battles))throw Error('团资料与工作区ID不一致。');
      if(!meta.battles.length||new Set(meta.battles.map(item=>item.id)).size!==meta.battles.length)throw Error('团的战斗索引为空或重复。');
      for(const battle of meta.battles){
        if(!/^[\w-]{1,100}$/.test(battle.id)||!(battle.path==='.'||battle.path===`战斗/${battle.id}`))throw Error('团的战斗目录索引无效。');
        const suffix=battle.path==='.'?'':('/'+battle.path),state=parse(await read(old+suffix+'/战斗状态.json'));
        if(state.campaignId!==campaign.id||state.formatVersion===2&&state.battleId!==battle.id)throw Error('权威战斗身份与团资料不一致。');
      }
      const id='campaign:'+campaign.id;
      const folder=plan.moduleFolders[id]||segment(String(meta.name||'战役').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,70)||'战役')+'--'+hash(campaign.id).slice(0,8);
      segment(folder);if(claimed.has(folder.toLowerCase())&&claimed.get(folder.toLowerCase())!==id)throw Error('兼容团目标目录已被占用。');
      plan.moduleFolders[id]=folder;claimed.set(folder.toLowerCase(),id);
      const target=`模组/${folder}/战斗/存档`;
      addMapping(old,target);addMapping('存档/'+campaign.path,target);campaigns.push({...campaign,folder,target,source:old,firstBattleId:meta.battles[0].id});knownIds.add(campaign.id);
      if(detached)plan.warnings.push({path:old,message:'已明确选择保留为独立游玩模组；子工作区仅归档，原活动团不变。'});
    }catch(error){block(AUTHORITY+'/工作区.json',error.message);}
  }
  for(const campaign of workspace?.campaigns||[])await registerCampaign(campaign);
  if(await status(join(root,AUTHORITY))){
    for(const entry of await readdir(join(root,AUTHORITY),{withFileTypes:true}))if(entry.isDirectory()&&!registered.has(entry.name)&&!cacheNames.has(entry.name.toLowerCase())){
      const rel=AUTHORITY+'/'+entry.name;let id;
      try{id=parse(await read(rel+'/团资料.json')).id;}catch{}
      if(id&&includeDetachedCampaignIds.includes(id))await registerCampaign({id,path:entry.name},{detached:true});
      else if(id&&archiveOnlyCampaignIds.includes(id))plan.warnings.push({path:rel,message:'明确指定只归档的旧试玩团，未纳入正式模组。'});
      else block(rel,'此旧存档目录未登记在权威工作区；保留，须明确归档或补齐归属。');
    }
  }
  const folderFor=id=>plan.moduleFolders[id];
  const reverseFolder=folder=>Object.entries(plan.moduleFolders).find(([,value])=>value===folder)?.[0];
  for(const item of existing.values()){
    if(/^当前\/[^/]+\/当前\.json$/.test(item.path)){
      try{const value=parse(await read(item.path)),folder=folderFor(value.moduleId);if(!folder)throw Error('当前文件的模组ID没有目录索引。');
        addMapping(dirname(item.path).split(sep).join('/'),`模组/${folder}/故事`);}
      catch(error){block(item.path,error.message);}
    }
    if(/^战斗\/[^/]+\/[^/]+\/战斗调用\.json$/.test(item.path)){
      try{const value=parse(await read(item.path)),folder=folderFor(value.moduleId),oldFolder=item.path.split('/')[1];
        if(!folder||reverseFolder(oldFolder)!==value.moduleId)throw Error('战斗调用的模组归属与目录索引不一致。');
        addMapping('战斗/'+oldFolder,`模组/${folder}/战斗`);}
      catch(error){block(item.path,error.message);}
    }
    if(/^对话\/[^/]+\/群聊\.json$/.test(item.path)){
      try{const value=parse(await read(item.path)),groupFolder=item.path.split('/')[1],folder=folderFor(value.moduleId||value.id);
        if(!folder||index.groupFolders?.[value.id]&&index.groupFolders[value.id]!==groupFolder)throw Error('群聊的模组归属不明确，未猜测目录。');
        addMapping('对话/'+groupFolder,`模组/${folder}/对话/${groupFolder}`);}
      catch(error){block(item.path,error.message);}
    }
  }
  async function operation(source,target,type='raw',generated){
    try{
      relativePath(target);await guard(root,join(root,target));
      const original=source?await read(source):null;
      let after=generated||original;
      if(type==='json'){const value=parse(original),changed=relocateJson(value,plan.mappings);after=JSON.stringify(value)===JSON.stringify(changed)?original:serialize(changed);}
      if(type==='markdown'){const text=original.toString('utf8'),changed=text.replace(/\]\(<([^>\r\n]+)>\)/g,(_,path)=>'](<'+relocateProjectPath(path,plan.mappings)+'>)');after=changed===text?original:Buffer.from(changed);}
      const afterSha256=hash(after),present=await read(target,true),same=present&&hash(present)===afterSha256;
      if(present&&!same&&source!==target)throw Error('目标已有不同内容，未覆盖。');
      const prior=plan.operations.find(item=>item.target===target);if(prior){if(prior.afterSha256!==afterSha256)throw Error('多个源将写入同一目标且内容不同。');return;}
      plan.operations.push({source:source||null,target,type,sourceSha256:original?hash(original):null,afterSha256,bytes:after.length,alreadyPresent:!!same});
      operationBuffers.set(target,after);
    }catch(error){block(source||target,error.message);}
  }
  for(const item of existing.values()){
    const rel=item.path,parts=rel.split('/');
    if(rel.startsWith('资料/'))await operation(rel,'资源/'+rel);
    else if(rel.startsWith('程序/')){
      const privateAt=parts.findIndex(part=>['.runtime','.tools','node_modules','.npm-cache'].includes(part));
      if(privateAt<0){block(rel,'旧程序仍含需由Git迁移的代码；工具不替代代码迁移。');continue;}
      if(parts.includes('node_modules'))continue;
      await operation(rel,'资源/'+rel);
    }else if(rel.startsWith('骰盘/')){
      if(parts.includes('node_modules'))continue;
      if(parts[1]==='.npm-cache'||parts[1]==='命运骰盘.html')await operation(rel,'资源/程序/'+rel);
      else block(rel,'旧骰盘仍含需由Git迁移的代码。');
    }else if(rel.startsWith('战斗/.tools/'))await operation(rel,rel.replace('战斗/.tools/','资源/程序/战斗/.tools/'));
    else if(/^当前\/[^/]+\//.test(rel)||/^战斗\/[^/]+\/[^/]+\//.test(rel)||/^对话\/[^/]+\//.test(rel)){
      const target=relocateProjectPath(rel,plan.mappings);
      if(target===rel){block(rel,'业务文件归属未知，保留。');continue;}
      await operation(rel,target,/\.json$/i.test(rel)?'json':/\.md$/i.test(rel)?'markdown':'raw');
    }
  }
  for(const campaign of campaigns)for(const item of existing.values())if(item.path.startsWith(campaign.source+'/')){
    const suffix=item.path.slice(campaign.source.length+1);if(excludedFromBattle(suffix))continue;
    await operation(item.path,campaign.target+'/'+suffix);
  }
  for(const campaign of campaigns)await operation(null,`模组/${campaign.folder}/打开平台.cmd`,'generated',platformEntryBytes());
  for(const folder of new Set(['预处理',...Object.values(plan.moduleFolders)]))for(const kind of ['故事','对话','战斗']){
    const path=`模组/${folder}/${kind}`;
    try{await guard(root,join(root,path));const present=await status(join(root,path));if(present&&!present.isDirectory())throw Error('模组分类目标不是目录。');plan.directories.push(path);}
    catch(error){block(path,error.message);}
  }
  plan.directories.sort();
  for(const sourceRoot of ['程序','骰盘']){
    const dependencyRoots=new Set([...existing.keys()].filter(path=>path.startsWith(sourceRoot+'/')&&path.split('/').includes('node_modules')).map(path=>path.slice(0,path.indexOf('node_modules')+'node_modules'.length)));
    for(const source of dependencyRoots){const target=sourceRoot==='程序'?'资源/'+source:'资源/程序/'+source;
      let alreadyPresent=false;
      if(await status(join(root,target))){
        try{
          const observed=[];
          async function inspect(folder){await guard(root,join(root,folder));for(const entry of await readdir(join(root,folder),{withFileTypes:true})){
            const path=folder+'/'+entry.name;if(entry.isSymbolicLink())throw Error('目标依赖目录含联接，未跟随。');
            if(entry.isDirectory())await inspect(path);else if(entry.isFile()){const value=await read(path);observed.push([path.slice(target.length+1),hash(value)]);}else throw Error('依赖树含非常规文件。');}}
          await inspect(target);
          const expected=[...existing.values()].filter(item=>item.path.startsWith(source+'/')).map(item=>[item.path.slice(source.length+1),item.sha256]);
          const order=(a,b)=>a[0].localeCompare(b[0]);
          if(JSON.stringify(observed.sort(order))!==JSON.stringify(expected.sort(order)))throw Error('目标依赖树已有不同内容，未合并。');
          alreadyPresent=true;
        }catch(error){block(target,error.message);continue;}
      }
      plan.dependencyMoves.push({source,target,alreadyPresent});
    }
  }
  // Source-derived descriptors stay in place but their explicit project-relative references follow the relocation.
  for(const path of Object.keys(index.documents||{})){
    try{
      relativePath(path);const original=await read(path);if(hash(original)!==index.documents[path])throw Error('管理索引摘要与文件不同，保留现场。');
      if(!existing.has(path))existing.set(path,{path,bytes:original.length,sha256:hash(original)});
      if(path.startsWith('资源/')&&path!==INDEX&&/\.json$/i.test(path))await operation(path,path,'json');
    }catch(error){block(path,error.message);}
  }
  if(bufferCache.has('资源/故事/F/发放记录.json'))await operation('资源/故事/F/发放记录.json','资源/故事/F/发放记录.json','json');
  if(workspace||campaigns.length){const next={...(workspace||{formatVersion:1,activeCampaignId:campaigns[0].id,activeBattleId:campaigns[0].firstBattleId}),campaigns:campaigns.map(campaign=>{const {folder,target,source,firstBattleId,...original}=campaign;return {...original,path:target.slice('模组/'.length)};})};
    await operation(workspace?AUTHORITY+'/工作区.json':null,'模组/工作区.json','generated',serialize(next));}
  const nextIndex=structuredClone(index);nextIndex.moduleFolders=plan.moduleFolders;nextIndex.documents={};
  for(const [path,sha]of Object.entries(index.documents||{})){
    const target=relocateProjectPath(path,plan.mappings),write=plan.operations.find(item=>item.target===target);
    if(nextIndex.documents[target]&&nextIndex.documents[target]!== (write?.afterSha256||sha))block(path,'重定位后管理文档键冲突。');
    nextIndex.documents[target]=write?.afterSha256||sha;
  }
  nextIndex.files=(index.files||[]).map(record=>{const path=relocateProjectPath(record.path,plan.mappings);return {...record,path,fingerprint:plan.operations.find(item=>item.target===path)?.afterSha256||record.fingerprint};});
  if(bufferCache.has(INDEX)){nextIndex.revision=index.revision+1;await operation(INDEX,INDEX,'generated',serialize(nextIndex));}
  plan.mappings.sort((a,b)=>b.from.length-a.from.length||a.from.localeCompare(b.from));
  const marker={version:2,mappings:plan.mappings};
  const priorMarker=await read(MARKER,true);
  if(priorMarker){
    try{const prior=parse(priorMarker);if(prior.version===2&&plan.archiveRoots.length===0){
      for(const mapping of prior.mappings||[])if((mapping.from==='存档'||mapping.from.startsWith('存档/')||mapping.from.startsWith(AUTHORITY+'/'))&&!await status(join(root,mapping.to)))throw Error('已迁移标记的存档目标缺失。');
      return {...plan,status:'already-migrated',operations:[],sourceManifest:[],mappings:prior.mappings,blockers:[],summary:{sourceFiles:0,sourceBytes:0,writes:0,alreadyPresent:0,dependencyMoves:0,blockers:0}};
    }throw Error('已有目录迁移标记，但仍存在旧布局；须人工核对。');}catch(error){block(MARKER,error.message);}
  }else await operation(null,MARKER,'generated',serialize(marker));
  // Legacy classified module originals are archived only after a matching published copy was verified.
  const preprocessed='模组/预处理/故事';
  const published=[];
  async function collectPublished(folder){for(const entry of await readdir(join(root,folder),{withFileTypes:true})){
    const path=folder+'/'+entry.name;if(entry.isSymbolicLink()){block(path,'预处理资料含链接。');continue;}
    if(entry.isDirectory())await collectPublished(path);else if(entry.isFile()&&/\.(pdf|png|jpe?g)$/i.test(entry.name))published.push(hash(await read(path)));}}
  if(await status(join(root,preprocessed)))await collectPublished(preprocessed);
  for(const category of ['单人短团','多人短团','长期团']){
    const old='模组/'+category;if(!await status(join(root,old)))continue;
    const oldFiles=[];
    async function inspect(folder){for(const entry of await readdir(join(root,folder),{withFileTypes:true})){
      const path=folder+'/'+entry.name;if(entry.isSymbolicLink()){block(path,'旧模组分类含链接。');continue;}
      if(entry.isDirectory())await inspect(path);else if(entry.isFile())oldFiles.push(path);}}
    await inspect(old);
    let matched=true;
    for(const path of oldFiles){const value=await read(path),sha256=hash(value);existing.set(path,{path,bytes:value.length,sha256});
      if(!/\.(pdf|png|jpe?g)$/i.test(path)||!published.includes(sha256)){block(path,'旧模组原件尚无摘要一致的预处理发布副本，保留。');matched=false;}}
    if(matched)plan.archiveRoots.push(old);
  }
  plan.sourceManifest=[...existing.values()].sort((a,b)=>a.path.localeCompare(b.path));
  plan.archiveRoots=[...new Set(plan.archiveRoots)].sort((a,b)=>b.length-a.length);
  plan.status=plan.blockers.length?'blocked':'planned';
  plan.summary={sourceFiles:plan.sourceManifest.length,sourceBytes:plan.sourceManifest.reduce((sum,item)=>sum+item.bytes,0),
    writes:plan.operations.length,alreadyPresent:plan.operations.filter(item=>item.alreadyPresent).length,
    dependencyMoves:plan.dependencyMoves.length,archiveRoots:plan.archiveRoots.length,blockers:plan.blockers.length};
  plan.fingerprint=hash(serialize({sourceManifest:plan.sourceManifest,operations:plan.operations,directories:plan.directories,mappings:plan.mappings,dependencyMoves:plan.dependencyMoves,archiveRoots:plan.archiveRoots}));
  Object.defineProperty(plan,'buffers',{value:operationBuffers,enumerable:false});
  return plan;
}

async function exclusive(root,path,value){
  await guard(root,path);await mkdir(dirname(path),{recursive:true});await guard(root,path);
  const handle=await open(path,'wx');try{await handle.writeFile(value);await handle.sync();}finally{await handle.close();}
}

/** Applies only a fresh unblocked plan. All original data is first retained under an explicit backup root. */
export async function applyProjectLayout(plan,{backupRoot,processIdentity=readProcessIdentity}={}){
  if(plan?.version!==2||plan.kind!=='project-layout-migration')throw Error('迁移清单格式无效。');
  if(plan.status==='already-migrated')return {version:2,status:'already-migrated'};
  if(plan.blockers?.length||plan.status!=='planned')throw Error('迁移存在阻塞项，未开始搬移。');
  const root=resolve(plan.projectRoot),fresh=await planProjectLayout({projectRoot:root,processIdentity,...plan.options});
  if(fresh.status!=='planned'||fresh.fingerprint!==plan.fingerprint)throw Error('源、目标或锁状态在预览后变化，请重新预览。');
  const workspace=dirname(root),base=resolve(backupRoot||join(workspace,'开发记录','临时','迁移备份'));
  contained(workspace,base);if(base===root||relative(root,base).split(sep)[0]!=='..')throw Error('备份根须在项目目录外、当前工作区内。');
  await guard(workspace,base);await mkdir(base,{recursive:true});
  const backup=join(base,'layout-'+Date.now()+'-'+randomUUID().slice(0,8));await mkdir(backup);const originals=join(backup,'旧布局原件');await mkdir(originals);
  const report={version:2,status:'prepared',projectRoot:root,backup,archiveMoves:[],dependencyMoves:[],writes:[],directories:[],sourceFingerprint:plan.fingerprint};
  await exclusive(backup,join(backup,'源清单.json'),serialize(plan));
  async function saveReport(){await writeFile(join(backup,'迁移结果.json'),serialize(report));}
  await saveReport();
  try{
    // In-place managed documents need their own untouched copies before old trees are archived.
    for(const item of plan.sourceManifest)if(!plan.archiveRoots.some(source=>item.path===source||item.path.startsWith(source+'/'))){
      const value=await bytes(root,item.path);if(hash(value)!==item.sha256)throw Error('源摘要在备份前变化。');
      await exclusive(originals,join(originals,item.path),value);
      if(hash(await bytes(originals,item.path))!==item.sha256)throw Error('备份摘要不一致。');
    }
    for(const source of plan.archiveRoots){
      const from=await guard(root,join(root,source)),to=await guard(originals,join(originals,source));await mkdir(dirname(to),{recursive:true});
      if(await status(to))throw Error('备份目标已存在。');await rename(from,to);report.archiveMoves.push({from:source,to:portable(relative(backup,to))});await saveReport();
    }
    for(const item of plan.sourceManifest){const saved=await bytes(originals,item.path);if(hash(saved)!==item.sha256)throw Error('完整源备份复核失败。');}
    report.status='backed-up';await saveReport();
    for(const path of fresh.directories){const target=await guard(root,join(root,path));await mkdir(target,{recursive:true});await guard(root,target);report.directories.push(path);}await saveReport();
    for(const move of plan.dependencyMoves){
      if(move.alreadyPresent)continue;
      const from=await guard(originals,join(originals,move.source)),to=await guard(root,join(root,move.target));await mkdir(dirname(to),{recursive:true});
      if(await status(to))throw Error('依赖目标已存在，未合并。');await rename(from,to);report.dependencyMoves.push(move);await saveReport();
    }
    for(const operation of fresh.operations){
      if(operation.alreadyPresent)continue;const after=fresh.buffers.get(operation.target);
      if(hash(after)!==operation.afterSha256)throw Error('写入内容摘要不一致。');
      const target=await guard(root,join(root,operation.target)),present=await bytes(root,operation.target,true);
      if(present){
        if(operation.source!==operation.target||hash(present)!==operation.sourceSha256)throw Error('目标在复制前发生变化。');
        const temporary=target+'.layout-'+randomUUID()+'.tmp';await exclusive(root,temporary,after);await rename(temporary,target);
      }else await exclusive(root,target,after);
      if(hash(await bytes(root,operation.target))!==operation.afterSha256)throw Error('目标复制后摘要不一致。');
      report.writes.push(operation.target);await saveReport();
    }
    // Identical pre-existing targets are checked again too: no concurrent edit may be reported as a completed copy.
    for(const operation of fresh.operations)if(hash(await bytes(root,operation.target))!==operation.afterSha256)throw Error('最终目标摘要与清单不同，未标记完成。');
    for(const move of fresh.dependencyMoves)for(const item of fresh.sourceManifest.filter(item=>item.path.startsWith(move.source+'/'))){
      if(hash(await bytes(root,move.target+item.path.slice(move.source.length)))!==item.sha256)throw Error('最终依赖文件摘要与源清单不同，未标记完成。');
    }
    report.status='complete';await saveReport();return report;
  }catch(error){report.status='incomplete';report.error=error.message;await saveReport();throw Error('目录重整未完成；原件与恢复清单保留在 '+backup+'。'+error.message);}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let projectRoot=fileURLToPath(new URL('../../项目/',import.meta.url)),apply=false,manifestPath,reportDirectory,backupRoot;const archiveOnlyCampaignIds=[],includeDetachedCampaignIds=[];
  for(let i=0;i<args.length;i++){
    if(args[i]==='--project-root')projectRoot=args[++i];else if(args[i]==='--report-dir')reportDirectory=args[++i];
    else if(args[i]==='--manifest')manifestPath=args[++i];else if(args[i]==='--backup-root')backupRoot=args[++i];
    else if(args[i]==='--archive-only-campaign')archiveOnlyCampaignIds.push(args[++i]);else if(args[i]==='--include-detached-campaign')includeDetachedCampaignIds.push(args[++i]);else if(args[i]==='--apply')apply=true;else throw Error('未知参数：'+args[i]);
  }
  reportDirectory=resolve(reportDirectory||join(dirname(resolve(projectRoot)),'开发记录','临时','迭代-20261029','目录重整'));
  await mkdir(reportDirectory,{recursive:true});
  if(apply){if(!manifestPath)throw Error('--apply须提供已预览的--manifest。');const report=await applyProjectLayout(parse(await readFile(resolve(manifestPath))),{backupRoot,processIdentity:readProcessIdentity});console.log(JSON.stringify({status:report.status,backup:report.backup}));}
  else{const plan=await planProjectLayout({projectRoot,archiveOnlyCampaignIds,includeDetachedCampaignIds});const output=join(reportDirectory,'目录重整预览-'+Date.now()+'.json');await writeFile(output,serialize(plan));console.log(JSON.stringify({status:plan.status,output,...plan.summary}));}
}
