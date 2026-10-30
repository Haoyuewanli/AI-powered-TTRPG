import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, symlink, writeFile, link } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyProjectLayout, planProjectLayout, relocateProjectPath } from '../重整项目目录.mjs';

const output=fileURLToPath(new URL('../../临时/迭代-20261029/目录重整合成检查/',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const execute=promisify(execFile);
const encode=value=>JSON.stringify(value,null,2)+'\n';
const authority='资源/故事/Z/战役存档',folder='合成模组',moduleId='campaign:campaign-one';
async function put(root,path,value){const target=join(root,path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,typeof value==='string'||Buffer.isBuffer(value)?value:encode(value));}
async function fixture(){
  await mkdir(output,{recursive:true});const workspace=await mkdtemp(join(output,'case-')),root=join(workspace,'项目');await mkdir(root);
  const state=Buffer.from('{"campaignId":"campaign-one","battleId":"battle-one","actors":[{"hp":7,"maxHp":12,"spellSlots":-2}],"combat":{"phase":"preparing","round":0}}\n');
  const current=`当前/${folder}/当前.json`,call=`战斗/${folder}/battle-one/战斗调用.json`,log=`战斗/${folder}/battle-one/战斗日志.txt`;
  const chat='对话/合成群聊/群聊.json',md='对话/合成群聊/对话.md',resource='资源/角色/T/测试角色.json';
  const values={
    [current]:{formatVersion:1,moduleId,moduleName:folder,instances:[{id:'one',base:resource,delta:{hp:-3,spellSlots:-1}}]},
    [call]:{formatVersion:1,id:'battle-one',moduleId,current:{path:current,instanceIds:['one']},payload:{authority:authority+'/campaign-one/战斗状态.json',hp:7}},
    [log]:'synthetic log\n',
    [chat]:{formatVersion:1,id:moduleId,name:'合成群聊',referenceBase:'project',references:[{resourceId:'pc-one',path:resource}],messages:1},
    [md]:'# Synthetic\n\n- [current](<'+current+'>)\n\n文字中的 当前/路径 不重写。\n',
    [resource]:{id:'pc-one',name:'synthetic',hp:7,sourceAuthority:authority+'/campaign-one/战斗状态.json'}
  };
  const documents={};for(const [path,value]of Object.entries(values)){await put(root,path,value);documents[path]=sha(await readFile(join(root,path)));}
  await put(root,'资源/故事/G/管理索引.json',{formatVersion:1,revision:5,files:[{id:'pc-one',path:resource,fingerprint:documents[resource]}],documents,
    moduleFolders:{[moduleId]:folder},groupFolders:{[moduleId]:'合成群聊'}});
  await put(root,authority+'/工作区.json',{formatVersion:1,campaigns:[{id:'campaign-one',path:'campaign-one'}],activeCampaignId:'campaign-one',activeBattleId:'battle-one'});
  const meta={formatVersion:1,id:'campaign-one',name:'合成战役',battles:[{id:'battle-one',name:'one',path:'.'}]};
  for(const prefix of [authority+'/campaign-one','存档/campaign-one']){
    await put(root,prefix+'/团资料.json',meta);await put(root,prefix+'/战斗状态.json',state);await put(root,prefix+'/战斗状态.previous.json',state);
    await put(root,prefix+'/战斗窗口/Cache/cache.bin','synthetic disposable cache');
  }
  await put(root,'存档/工作区.json',{formatVersion:1,campaigns:[{id:'campaign-one',path:'campaign-one'}]});
  await put(root,'程序/平台/.runtime/外观.json',{color:'#fedcba'});
  await put(root,'程序/平台/.runtime/browser/Default/Preferences','synthetic profile');
  await put(root,'程序/战斗/.tools/tool.exe','synthetic executable bytes');
  await put(root,'骰盘/node_modules/test-package/index.js','synthetic dependency');
  await put(root,'骰盘/命运骰盘.html','synthetic generated offline HTML');
  await put(root,'资料/私人全文.json',{synthetic:true,raw:'no third-party text'});
  await put(root,'跑团平台/README.md','obsolete stub');await put(root,'平台/README.md','obsolete stub');
  return {workspace,root,state,current,call,log,chat,md,resource,backupRoot:join(workspace,'开发记录','临时','迁移备份')};
}

test('dry run hashes all source data without moving it and prepares exact legacy aliases',async()=>{
  const f=await fixture(),plan=await planProjectLayout({projectRoot:f.root});
  assert.equal(plan.status,'planned',JSON.stringify(plan.blockers));
  assert.ok(plan.sourceManifest.length>15);assert.equal(plan.dependencyMoves.length,1);
  for(const item of plan.sourceManifest)assert.equal(sha(await readFile(join(f.root,item.path))),item.sha256);
  assert.ok(plan.mappings.some(x=>x.from==='存档'&&x.to==='模组'));
  assert.ok(plan.mappings.some(x=>x.from===authority&&x.to==='模组'));
  for(const from of ['存档/campaign-one',authority+'/campaign-one'])assert.equal(plan.mappings.find(x=>x.from===from).to,`模组/${folder}/战斗/存档`);
  await assert.rejects(access(f.backupRoot),{code:'ENOENT'});
});

test('synthetic apply backs up originals, relocates references and index hashes while preserving every battle-state byte',async()=>{
  const f=await fixture(),plan=await planProjectLayout({projectRoot:f.root}),result=await applyProjectLayout(JSON.parse(JSON.stringify(plan)),{backupRoot:f.backupRoot});
  assert.equal(result.status,'complete');const statePath=`模组/${folder}/战斗/存档/战斗状态.json`;
  assert.deepEqual(await readFile(join(f.root,statePath)),f.state);
  assert.deepEqual(await readFile(join(result.backup,'旧布局原件',authority,'campaign-one','战斗状态.json')),f.state);
  assert.deepEqual(await readFile(join(result.backup,'旧布局原件','存档','campaign-one','战斗状态.json')),f.state);
  const current=JSON.parse(await readFile(join(f.root,`模组/${folder}/故事/当前.json`),'utf8'));
  assert.deepEqual(current.instances[0].delta,{hp:-3,spellSlots:-1});
  const call=JSON.parse(await readFile(join(f.root,`模组/${folder}/战斗/battle-one/战斗调用.json`),'utf8'));
  assert.equal(call.current.path,`模组/${folder}/故事/当前.json`);assert.equal(call.payload.hp,7);assert.equal(call.payload.authority,statePath);
  const chatPath=`模组/${folder}/对话/合成群聊/对话.md`;
  assert.match(await readFile(join(f.root,chatPath),'utf8'),/\]\(<模组\/合成模组\/故事\/当前.json>\)/);
  assert.match(await readFile(join(f.root,chatPath),'utf8'),/文字中的 当前\/路径 不重写/);
  const index=JSON.parse(await readFile(join(f.root,'资源/故事/G/管理索引.json'),'utf8'));
  assert.equal(index.revision,6);assert.equal(index.documents[`模组/${folder}/故事/当前.json`],sha(await readFile(join(f.root,`模组/${folder}/故事/当前.json`))));
  assert.equal(index.documents[f.current],undefined);
  const descriptor=JSON.parse(await readFile(join(f.root,f.resource),'utf8'));assert.equal(descriptor.hp,7);assert.equal(descriptor.sourceAuthority,statePath);
  const workspace=JSON.parse(await readFile(join(f.root,'模组/工作区.json'),'utf8'));assert.equal(workspace.campaigns[0].path,`${folder}/战斗/存档`);
  assert.equal(await readFile(join(f.root,'资源/程序/骰盘/node_modules/test-package/index.js'),'utf8'),'synthetic dependency');
  assert.equal(await readFile(join(f.root,'资源/程序/平台/.runtime/browser/Default/Preferences'),'utf8'),'synthetic profile');
  await assert.rejects(access(join(f.root,`模组/${folder}/战斗/存档/战斗窗口`)),{code:'ENOENT'});
  for(const old of ['程序','骰盘','资料','当前','战斗','对话','存档','跑团平台','平台',authority])await assert.rejects(access(join(f.root,old)),{code:'ENOENT'});
});

test('different destination contents block all mutation, identical ordinary files and dependency trees can be reused',async()=>{
  const f=await fixture();await put(f.root,'资源/资料/私人全文.json','different target');
  let plan=await planProjectLayout({projectRoot:f.root});assert.equal(plan.status,'blocked');assert.ok(plan.blockers.some(x=>/不同内容/.test(x.message)));
  await assert.rejects(applyProjectLayout(plan,{backupRoot:f.backupRoot}),/阻塞/);await assert.rejects(access(f.backupRoot),{code:'ENOENT'});
  await put(f.root,'资源/资料/私人全文.json',await readFile(join(f.root,'资料/私人全文.json')));
  await put(f.root,'资源/程序/骰盘/node_modules/test-package/index.js','synthetic dependency');
  plan=await planProjectLayout({projectRoot:f.root});assert.equal(plan.status,'planned',JSON.stringify(plan.blockers));
  assert.equal(plan.dependencyMoves[0].alreadyPresent,true);assert.ok(plan.operations.find(x=>x.target==='资源/资料/私人全文.json').alreadyPresent);
});

test('live Node/unknown owner locks block migration, known non-Node PID reuse does not bypass data checks',async()=>{
  const f=await fixture();await put(f.root,authority+'/.workspace.lock',String(process.pid));
  for(const kind of ['node','unknown']){const plan=await planProjectLayout({projectRoot:f.root,processIdentity:async()=>({kind})});assert.equal(plan.status,'blocked');assert.ok(plan.blockers.some(x=>/活动Node|身份未明/.test(x.message)));}
  const plan=await planProjectLayout({projectRoot:f.root,processIdentity:async()=>({kind:'non-node',executable:'svchost.exe'})});
  assert.equal(plan.status,'planned',JSON.stringify(plan.blockers));assert.equal(plan.locks[0].status,'reused-non-node-pid');
});

test('unknown chat or campaign ownership is retained and blocks success unless an old campaign is explicitly archive-only',async()=>{
  const f=await fixture();await put(f.root,'对话/未知群聊/群聊.json',{formatVersion:1,id:'not-a-module',name:'unknown'});
  await put(f.root,authority+'/unregistered/团资料.json',{formatVersion:1,id:'unregistered',name:'unregistered',battles:[]});
  let plan=await planProjectLayout({projectRoot:f.root});assert.equal(plan.status,'blocked');assert.ok(plan.blockers.some(x=>/未登记/.test(x.message)));assert.ok(plan.blockers.some(x=>/群聊的模组归属/.test(x.message)));
  plan=await planProjectLayout({projectRoot:f.root,archiveOnlyCampaignIds:['unregistered']});
  assert.ok(!plan.blockers.some(x=>x.path===authority+'/unregistered'));assert.ok(plan.blockers.some(x=>/群聊/.test(x.message)));
  await access(join(f.root,'对话/未知群聊/群聊.json'));
});

test('explicit detached campaigns become separate runs without replacing the original active selection or copying nested workspaces',async()=>{
  const f=await fixture(),detached=[];
  for(const id of ['solo-trial','resource-trial']){
    const path='旧试玩-'+id,state=Buffer.from(encode({formatVersion:2,campaignId:id,battleId:id+'-battle',actors:[{hp:11}],combat:{phase:'preparing'}}));
    await put(f.root,authority+'/'+path+'/团资料.json',{formatVersion:1,id,name:'独立'+id,battles:[{id:id+'-battle',name:'试玩',path:'.'}]});
    await put(f.root,authority+'/'+path+'/战斗状态.json',state);
    await put(f.root,authority+'/'+path+'/.工作区/工作区.json',{formatVersion:1,activeCampaignId:id});
    await put(f.root,authority+'/'+path+'/打开试玩.cmd','old relative entry retained only in backup');
    detached.push({id,path,state});
  }
  const plan=await planProjectLayout({projectRoot:f.root,includeDetachedCampaignIds:detached.map(item=>item.id)});
  assert.equal(plan.status,'planned',JSON.stringify(plan.blockers));
  const report=await applyProjectLayout(plan,{backupRoot:f.backupRoot}),workspace=JSON.parse(await readFile(join(f.root,'模组/工作区.json'),'utf8'));
  assert.equal(workspace.campaigns.length,3);assert.equal(workspace.activeCampaignId,'campaign-one');assert.equal(workspace.activeBattleId,'battle-one');
  for(const item of detached){
    const record=workspace.campaigns.find(entry=>entry.id===item.id),actual=join(f.root,'模组',record.path);
    assert.deepEqual(await readFile(join(actual,'战斗状态.json')),item.state);
    await assert.rejects(access(join(actual,'.工作区')),{code:'ENOENT'});await assert.rejects(access(join(actual,'打开试玩.cmd')),{code:'ENOENT'});
    assert.equal(await readFile(join(report.backup,'旧布局原件',authority,item.path,'打开试玩.cmd'),'utf8'),'old relative entry retained only in backup');
    const group=record.path.split('/')[0],cmd=await readFile(join(f.root,'模组',group,'打开平台.cmd'));
    for(const kind of ['故事','对话','战斗'])assert((await lstat(join(f.root,'模组',group,kind))).isDirectory());
    assert(!cmd.toString('ascii').includes('--campaign'));assert(!cmd.toString('ascii').includes('--workspace'));
    assert(cmd.every(byte=>byte<128));assert(!/(?<!\r)\n/.test(cmd.toString('ascii')));
  }
  const group=workspace.campaigns.find(entry=>entry.id==='solo-trial').path.split('/')[0],groupRoot=join(f.root,'模组',group);
  await put(f.root,'资源/程序/平台/project-entry.mjs',"import {writeFileSync} from 'node:fs';writeFileSync('entry-proof.json',JSON.stringify(process.argv.slice(2)));\n");
  const cmd=await readFile(join(groupRoot,'打开平台.cmd'),'ascii');
  if(process.platform==='win32')await execute('cmd.exe',['/d','/c','打开平台.cmd'],{cwd:groupRoot,windowsHide:true,timeout:10000});
  else {const code=cmd.split('\r\n').find(line=>line.startsWith('node -e ')).match(/^node -e "(.*)" --/)[1];await execute(process.execPath,['-e',code,'--',groupRoot],{cwd:groupRoot,timeout:10000});}
  assert.deepEqual(JSON.parse(await readFile(join(groupRoot,'entry-proof.json'),'utf8')),[]);
});

test('ordinary hard links are refused before a source tree can be archived',async()=>{
  const f=await fixture(),outside=join(f.workspace,'outside-private.txt');await writeFile(outside,'synthetic external file');
  await link(outside,join(f.root,'资料','linked.txt'));
  const plan=await planProjectLayout({projectRoot:f.root});assert.equal(plan.status,'blocked');assert.ok(plan.blockers.some(item=>/非硬链接/.test(item.message)));
  await assert.rejects(applyProjectLayout(plan,{backupRoot:f.backupRoot}),/阻塞/);assert.equal(await readFile(outside,'utf8'),'synthetic external file');
});

test('a stale preview cannot move changed originals or create a backup tree',async()=>{
  const f=await fixture(),plan=await planProjectLayout({projectRoot:f.root});
  await put(f.root,'资料/私人全文.json',{synthetic:true,changed:true});
  await assert.rejects(applyProjectLayout(plan,{backupRoot:f.backupRoot}),/预览后变化/);
  await access(join(f.root,f.current));await assert.rejects(access(f.backupRoot),{code:'ENOENT'});
});

test('version-2 completed migration is idempotent and does not rewrite subsequent game progress',async()=>{
  const f=await fixture(),plan=await planProjectLayout({projectRoot:f.root});await applyProjectLayout(plan,{backupRoot:f.backupRoot});
  const changed=Buffer.from('{"campaignId":"campaign-one","actors":[{"hp":3}]}\n');await put(f.root,`模组/${folder}/战斗/存档/战斗状态.json`,changed);
  const foldersBefore=await readdir(f.backupRoot),second=await planProjectLayout({projectRoot:f.root});
  assert.equal(second.status,'already-migrated',JSON.stringify(second.blockers));assert.equal((await applyProjectLayout(second,{backupRoot:f.backupRoot})).status,'already-migrated');
  assert.deepEqual(await readdir(f.backupRoot),foldersBefore);assert.deepEqual(await readFile(join(f.root,`模组/${folder}/战斗/存档/战斗状态.json`)),changed);
});

test('exact longest prefix rewrites paths without touching unrelated text or numbers',()=>{
  const mappings=[{from:'存档',to:'模组'},{from:'存档/campaign-one',to:'模组/one/战斗/存档'}];
  assert.equal(relocateProjectPath('存档/campaign-one/战斗状态.json',mappings),'模组/one/战斗/存档/战斗状态.json');
  assert.equal(relocateProjectPath('故事中提到存档/campaign-one',mappings),'故事中提到存档/campaign-one');
  assert.equal(relocateProjectPath(-5,mappings),-5);
});

test('external junction is never followed',async t=>{
  const f=await fixture(),outside=join(f.workspace,'outside');await mkdir(outside);await put(outside,'private.txt','must remain');
  try{await symlink(outside,join(f.root,'资料','external'),process.platform==='win32'?'junction':'dir');}
  catch(error){if(['EPERM','EACCES','ENOSYS'].includes(error.code)){t.skip('环境未允许建立合成目录链接');return;}throw error;}
  const plan=await planProjectLayout({projectRoot:f.root});assert.equal(plan.status,'blocked');assert.ok(plan.blockers.some(x=>/链接/.test(x.message)));
  assert.equal(await readFile(join(outside,'private.txt'),'utf8'),'must remain');
});
