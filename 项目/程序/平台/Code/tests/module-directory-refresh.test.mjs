import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rename, cp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { createLibraryStore } from '../library-store.mjs';
import { discoverModules } from '../module-discovery.mjs';
import { outputDirectory } from './check-helpers.mjs';
const dm = { role: 'dm' };
async function fixture() {
 await mkdir(outputDirectory, { recursive: true }); const root = await mkdtemp(join(outputDirectory, 'directory-refresh-'));
 const put = async (path, value) => { const target = join(root,path); await mkdir(dirname(target),{recursive:true}); await writeFile(target, typeof value === 'string' ? value : JSON.stringify(value)); };
 await put('模组/甲/模组.json',{id:'module-a',name:'冒险甲'});
 await put('模组/甲/游玩团/run-a/团.json',{id:'run-a',moduleId:'module-a',name:'团甲',characters:[{id:'role-a',name:'角色甲',playerId:'player-a'}]});
 return { root, put, store:createLibraryStore({root}) };
}
test('目录刷新跟随稳定模组ID，发现空分类和嵌套分类，移动与移出不改写已有数据',async()=>{
 const {root,put,store}=await fixture(); await store.select(dm,{moduleId:'module-a',runId:'run-a'});
 const state=await readFile(join(root,'模组/资料库工作区.json')); const run=await readFile(join(root,'模组/甲/游玩团/run-a/团.json'));
 await mkdir(join(root,'模组/分类/子分类'),{recursive:true}); await mkdir(join(root,'模组/空分类'));
 await rename(join(root,'模组/甲'),join(root,'模组/分类/子分类/甲'));
 let result=await store.context(dm); assert.equal(result.modules[0].category,'分类/子分类'); assert.equal(result.selected.runId,'run-a'); assert(result.categories.includes('空分类'));
 await put('模组/新分类/乙/模组.json',{id:'module-b',name:'冒险乙'}); await put('模组/损坏/模组.json','{bad');
 result=await store.context(dm); assert.equal(result.modules.length,2); assert(result.issues.length);
 await rename(join(root,'模组/分类/子分类/甲'),join(root,'移出的甲'));
 result=await store.context(dm); assert.equal(result.selected,null); assert.equal(result.modules.length,1);
 assert.deepEqual(await readFile(join(root,'模组/资料库工作区.json')),state); assert.deepEqual(await readFile(join(root,'移出的甲/游玩团/run-a/团.json')),run);
});
test('刷新隔离重复ID和读取中消失的目录',async()=>{
 const {root,store}=await fixture(); await cp(join(root,'模组/甲'),join(root,'模组/重复'),{recursive:true});
 assert.equal((await store.context(dm)).modules.length,0);
 const value=await discoverModules({directories:async path=> {if(path==='模组')return ['消失','好分类']; if(path.endsWith('消失'))throw new Error('gone'); return [];},readManifest:async()=>{throw Object.assign(new Error('gone'),{code:'ENOENT'});}});
 assert.equal(value.modules.length,0); assert(value.categories.includes('好分类')); assert.equal(value.issues.length,1);
});
test('团重命名、副本、归档和群聊只修改指定团，归档保留原文件并撤销邀请',async()=>{
 const {root,store}=await fixture(); await store.select(dm,{moduleId:'module-a',runId:'run-a'}); const invite=await store.createInvite(dm,{playerId:'player-a'});
 const pa={token:invite.token}; await store.chat(pa,{moduleId:'module-a',runId:'run-a',text:'测试消息'}); assert.equal((await store.chat(dm)).messages[0].speaker,'角色甲');
 await assert.rejects(store.chat(pa,{moduleId:'other',runId:'run-a',text:'不能串团'}),e=>e.status===409);
 let revision=(await store.context(dm)).revision;
 await store.manageRun(dm,{moduleId:'module-a',runId:'run-a',action:'rename',name:'改名',expectedRevision:revision});
 revision=(await store.context(dm)).revision; await store.manageRun(dm,{moduleId:'module-a',runId:'run-a',action:'copy',name:'副本',expectedRevision:revision});
 const data=await store.context(dm); assert.equal(data.modules[0].runs.length,2); assert.equal(data.selected.runName,'改名');
 await store.manageRun(dm,{moduleId:'module-a',runId:'run-a',action:'archive',expectedRevision:data.revision});
 assert.equal((await store.context(dm)).selected,null); await assert.rejects(store.context(pa),e=>e.status===401);
 assert.equal((await store.context(dm)).modules[0].runs.length,1);
});
